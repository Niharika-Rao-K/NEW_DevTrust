const express = require("express");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP ENV VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_ENV = [
    "PRIVATE_KEY",
    "RPC_URL",
    "CONTRACT_ADDRESS",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GITHUB_REDIRECT_URI",
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
}

const app = express();
app.set("trust proxy", 1);

// Raw body parser for webhook — MUST come before express.json()
// GitHub's HMAC is computed on the raw bytes, not re-serialized JSON.
app.use("/webhook", express.raw({ type: "application/json" }));

// JSON body parser for all other routes
app.use((req, res, next) => {
    if (req.path.startsWith("/webhook")) return next();
    express.json()(req, res, next);
});

// --- CORS ---
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));

// --- Rate Limiting ---
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: "Too many requests." });
const adminLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: "Rate limit reached." });
app.use("/webhook", webhookLimiter);
app.use("/admin/logs", adminLimiter);

// --- Configuration & Paths ---
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "db.json");
const ABI_PATH = path.join(__dirname, "devTrust.json");
const USERS_PATH = path.join(__dirname, "users.json");

// --- Initialize Database File if it doesn't exist ---
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2));
}
if (!fs.existsSync(USERS_PATH)) {
    fs.writeFileSync(USERS_PATH, JSON.stringify([], null, 2));
}

// --- Blockchain Setup ---
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contractJSON = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));
const contractABI = contractJSON.abi;
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, wallet);

// --- Utility Functions ---

function extractWallet(text) {
    if (!text) return null;
    const regex = /0x[a-fA-F0-9]{40}/;
    const match = text.match(regex);
    return match ? match[0] : null;
}

function addToQueue(walletAddress, prId, type) {
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

    if (db.find((item) => item.prId === prId)) {
        console.log(`⚠️ PR #${prId} already exists in DB. Skipping...`);
        return;
    }

    db.push({
        prId,
        wallet: walletAddress,
        type,
        status: "PENDING_BLOCKCHAIN",
        retries: 0,
        timestamp: new Date().toISOString(),
    });

    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    console.log(`📥 Added PR #${prId} to queue`);
}

// --- Webhook Signature Verification ---
// FIXED: uses raw Buffer body (req.body) instead of re-serialized JSON
function verifySignature(req, res, next) {
    const signature = req.headers["x-hub-signature-256"];

    if (!process.env.WEBHOOK_SECRET) {
        console.warn("⚠️ WEBHOOK_SECRET not set — skipping signature check.");
        // Parse the raw body into req.body so route handlers get an object
        try { req.body = JSON.parse(req.body); } catch {}
        return next();
    }

    if (!signature) {
        console.log("❌ Rejected: No signature found.");
        return res.status(401).send("No signature");
    }

    // req.body is a raw Buffer here because of express.raw()
    const hmac = crypto.createHmac("sha256", process.env.WEBHOOK_SECRET);
    const digest = "sha256=" + hmac.update(req.body).digest("hex");

    if (signature !== digest) {
        console.log("❌ Rejected: Signature mismatch.");
        return res.status(401).send("Invalid signature");
    }

    console.log("✅ Verified: Request came from GitHub.");

    // Parse raw body into object for route handler
    try {
        req.body = JSON.parse(req.body);
    } catch {
        return res.status(400).send("Invalid JSON body");
    }

    next();
}

// --- Admin Auth Middleware ---
function requireAdminToken(req, res, next) {
    if (!process.env.ADMIN_SECRET) return next(); // skip if not configured
    const token = req.headers["x-admin-token"];
    if (token !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

// ─────────────────────────────────────────────────────────────────────────────
// GITHUB OAUTH ROUTES
// ─────────────────────────────────────────────────────────────────────────────

app.get("/auth/github", (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        redirect_uri: process.env.GITHUB_REDIRECT_URI,
        scope: "read:user",
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

app.get("/auth/github/callback", async (req, res) => {
    const { code } = req.query;
    try {
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
                redirect_uri: process.env.GITHUB_REDIRECT_URI,
            }),
        });
        const { access_token, error } = await tokenRes.json();

        if (error || !access_token) {
            console.error("GitHub OAuth error:", error);
            return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}?auth_error=true`);
        }

        const userRes = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" },
        });
        const user = await userRes.json();

        const frontendParams = new URLSearchParams({
            github_id: user.id.toString(),
            github_login: user.login,
            github_avatar: user.avatar_url,
            github_name: user.name ?? user.login,
        });

        res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}?${frontendParams}`);
    } catch (err) {
        console.error("GitHub callback error:", err);
        res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}?auth_error=true`);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK ROUTE
// ─────────────────────────────────────────────────────────────────────────────

app.post("/webhook", verifySignature, (req, res) => {
    console.log("\n==============================");
    console.log("📩 Webhook Received");

    const event = req.headers["x-github-event"];
    console.log("Event:", event);

    if (event !== "pull_request") {
        console.log("⏭ Ignored non-PR event");
        return res.status(200).send("Ignored");
    }

    const { action, pull_request } = req.body;
    console.log("Action:", action);

    if (!pull_request) {
        console.log("❌ No pull_request object found");
        return res.status(200).send("Invalid payload");
    }

    if (action === "closed") {
    const prId = pull_request.number.toString();

    console.log(`🔄 Processing PR #${prId}`);

    // Get the GitHub username of the PR author
    const githubLogin = pull_request.user.login;

    console.log("GitHub User:", githubLogin);

    // Look up the wallet registered for this GitHub user
    let users = [];

    try {
        users = JSON.parse(
            fs.readFileSync(USERS_PATH, "utf8")
        );
    } catch (error) {
        console.error("❌ Could not read users.json:", error);
        return res.status(500).send("User database error");
    }

    const registeredUser = users.find(
        user =>
            user.githubLogin.toLowerCase() ===
            githubLogin.toLowerCase()
    );

    const userWallet = registeredUser?.walletAddress;

    console.log("Registered Wallet:", userWallet);

    if (!userWallet) {
        console.log(
            `⚠️ No wallet registered for GitHub user ${githubLogin}`
        );

        return res.status(200).send("No registered wallet");
    }

    if (pull_request.merged === true) {
        console.log(`✅ PR #${prId} MERGED`);

        addToQueue(
            userWallet,
            prId,
            "SUCCESS"
        );
    } else {
        console.log(
            `❌ PR #${prId} CLOSED WITHOUT MERGE`
        );

        addToQueue(
            userWallet,
            prId,
            "REJECTED"
        );
    }
}

    res.status(200).send("Webhook Processed");
});

// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────────────────────────────────────

app.post("/api/register-wallet", (req, res) => {
    try {
        const { githubLogin, walletAddress } = req.body;

        if (!githubLogin || !walletAddress) {
            return res.status(400).json({
                error: "GitHub username and wallet address are required"
            });
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            return res.status(400).json({
                error: "Invalid Ethereum wallet address"
            });
        }

        const users = JSON.parse(fs.readFileSync(USERS_PATH, "utf8"));

        const existingUser = users.find(
            user => user.githubLogin.toLowerCase() === githubLogin.toLowerCase()
        );

        if (existingUser) {
            existingUser.walletAddress = walletAddress;
        } else {
            users.push({
                githubLogin,
                walletAddress,
                registeredAt: new Date().toISOString()
            });
        }

        fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));

        console.log(
            `🔗 Wallet registered: ${githubLogin} → ${walletAddress}`
        );

        res.json({
            success: true,
            githubLogin,
            walletAddress
        });

    } catch (error) {
        console.error("❌ Wallet registration error:", error);
        res.status(500).json({
            error: "Failed to register wallet"
        });
    }
});

app.get("/api/logs", (req, res) => {
    const data = fs.readFileSync(DB_PATH, "utf8");
    res.json(JSON.parse(data));
});

// Protected admin endpoint — set ADMIN_SECRET in .env to enable auth
app.get("/admin/logs", requireAdminToken, adminLimiter, async (req, res) => {
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    try {
        const balance = await provider.getBalance(wallet.address);
        res.json({
            oracle_address: wallet.address,
            oracle_balance: ethers.formatEther(balance) + " ETH",
            total_records: db.length,
            pending: db.filter((l) => l.status === "PENDING_BLOCKCHAIN").length,
            completed: db.filter((l) => l.status === "COMPLETED").length,
            failed: db.filter((l) => l.status === "FAILED").length,
            data: db,
        });
    } catch {
        res.json({ total_records: db.length, data: db });
    }
});

app.get("/", (req, res) => {
    res.send("🚀 DevTrust Backend is Live");
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCKCHAIN PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;

async function processQueue() {
    let db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

    // Retry eligible: PENDING_BLOCKCHAIN or FAILED with retries remaining
    const pending = db.filter(
        (item) =>
            item.status === "PENDING_BLOCKCHAIN" ||
            (item.status === "FAILED" && (item.retries ?? 0) < MAX_RETRIES)
    );

    if (pending.length === 0) {
        console.log("⏳ No pending events");
        return;
    }

    // Gas check
    const balance = await provider.getBalance(wallet.address);
    const balanceEth = parseFloat(ethers.formatEther(balance));
    console.log(`⛽ Oracle Balance: ${balanceEth} ETH`);
    if (balanceEth < 0.001) {
        console.log(`❌ Low gas! Top up: ${wallet.address}`);
        return;
    }

    console.log(`⛓️ Processing ${pending.length} pending events...`);

    for (const item of pending) {
        try {
            let tx;
            if (item.type === "SUCCESS") {
                console.log(`🚀 Minting reward for PR #${item.prId}`);
                tx = await contract.addRecord(item.wallet, item.prId);
            } else {
                console.log(`🧨 Slashing PR #${item.prId}`);
                tx = await contract.slash(item.wallet);
            }

            const receipt = await tx.wait();
            item.status = "COMPLETED";
            item.txHash = receipt.hash;
            item.retries = item.retries ?? 0;
            console.log(`✨ Success! Tx: ${receipt.hash}`);
        } catch (error) {
            item.retries = (item.retries ?? 0) + 1;
            console.error(
                `❌ Error for PR #${item.prId} (attempt ${item.retries}/${MAX_RETRIES}):`,
                error.shortMessage || error.message
            );

            if (item.retries >= MAX_RETRIES) {
                item.status = "FAILED";
                item.error = error.message;
                console.error(`🚫 PR #${item.prId} permanently failed after ${MAX_RETRIES} attempts.`);
            } else {
                // Keep as PENDING_BLOCKCHAIN so it retries next cycle
                item.status = "PENDING_BLOCKCHAIN";
                item.error = error.message;
            }
        }
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

setInterval(processQueue, 10000);

app.listen(PORT, () => {
    console.log(`🚀 DevTrust Backend running on port ${PORT}`);
    console.log(`⚙️ Blockchain Processor active (10s intervals, max ${MAX_RETRIES} retries)`);
    console.log(`🔗 Contract: ${process.env.CONTRACT_ADDRESS}`);
    console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:5173"}`);
});
