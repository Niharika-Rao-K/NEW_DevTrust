const express = require("express");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
app.set("trust proxy", 1);

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================

const REQUIRED_ENV = [
    "PRIVATE_KEY",
    "RPC_URL",
    "CONTRACT_ADDRESS",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GITHUB_REDIRECT_URI",
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missing.length > 0) {
    console.error(
        `Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
}

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = process.env.PORT || 3000;
const FRONTEND_URL =
    process.env.FRONTEND_URL || "http://localhost:5173";

const DB_PATH = path.join(__dirname, "db.json");
const USERS_PATH = path.join(__dirname, "users.json");

// ============================================================
// DEVTRUST V2 ABI
// ============================================================

const DEVTRUST_V2_ABI = [
    // Constructor/read functions
    "function trustName() view returns (string)",
    "function owner() view returns (address)",
    "function oracle() view returns (address)",
    "function treasury() view returns (address)",
    "function challengePeriod() view returns (uint256)",
    "function nextPRId() view returns (uint256)",

    // PR registration
    "function registerPR(string repository,uint256 prNumber,string prUrl,address company,uint256 reviewerRewardPool) payable returns (uint256)",

    // Reviewer staking
    "function stakeOnPR(uint256 prId,bool approveVote) payable",

    // Oracle verification
    "function verifyPRMerged(uint256 prId,string mergeCommit)",

    // Company decision
    "function approvePR(uint256 prId)",
    "function rejectPR(uint256 prId)",

    // Settlement
    "function settlePR(uint256 prId)",

    // PR reads
    "function getPRBasic(uint256 prId) view returns (uint256,string,uint256,string,address,address)",
    "function getPRStaking(uint256 prId) view returns (uint256,uint256)",
    "function getPRStatus(uint256 prId) view returns (uint8,bool)",
    "function getPRMergeInfo(uint256 prId) view returns (uint256,uint256,string)",

    // Reviewer reads
    "function getReview(uint256 prId,address reviewer) view returns (address,uint256,bool,bool,bool)",
    "function getReviewerCount(uint256 prId) view returns (uint256)",
    "function getReviewerAt(uint256 prId,uint256 index) view returns (address)",

    // Reputation / SBT
    "function getDeveloperReputation(address developer) view returns (uint256)",
    "function getSBTInfo(address developer) view returns (uint256,string,string)",
];

// ============================================================
// FILE DATABASE
// ============================================================

if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2));
}

if (!fs.existsSync(USERS_PATH)) {
    fs.writeFileSync(USERS_PATH, JSON.stringify([], null, 2));
}

function readJSON(filePath, fallback = []) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        console.error(`Could not read ${filePath}:`, error.message);
        return fallback;
    }
}

function writeJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ============================================================
// BLOCKCHAIN SETUP
// ============================================================

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const oracleWallet = new ethers.Wallet(
    process.env.PRIVATE_KEY,
    provider
);

const contract = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    DEVTRUST_V2_ABI,
    oracleWallet
);

console.log("DevTrust v2 configuration loaded.");
console.log("Contract:", process.env.CONTRACT_ADDRESS);
console.log("Oracle wallet:", oracleWallet.address);

// ============================================================
// MIDDLEWARE
// ============================================================

// GitHub webhook must receive the raw request body because
// GitHub calculates its HMAC signature from the raw bytes.
app.use(
    "/webhook",
    express.raw({
        type: "application/json",
    })
);

// Normal JSON parser for all other routes.
app.use((req, res, next) => {
    if (req.path.startsWith("/webhook")) {
        return next();
    }

    express.json()(req, res, next);
});

// CORS
app.use(
    cors({
        origin: FRONTEND_URL,
    })
);

// Rate limiting
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: "Too many webhook requests.",
});

const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: "Rate limit reached.",
});

app.use("/webhook", webhookLimiter);

// ============================================================
// GITHUB WEBHOOK SIGNATURE VERIFICATION
// ============================================================

function verifySignature(req, res, next) {
    const signature = req.headers["x-hub-signature-256"];

    // Development fallback.
    if (!process.env.WEBHOOK_SECRET) {
        console.warn(
            "WARNING: WEBHOOK_SECRET not configured. " +
            "Webhook signature verification is disabled."
        );

        try {
            req.body = JSON.parse(req.body.toString("utf8"));
        } catch (error) {
            return res.status(400).send("Invalid JSON body");
        }

        return next();
    }

    if (!signature) {
        console.log("Rejected webhook: missing signature.");
        return res.status(401).send("No signature");
    }

    const hmac = crypto.createHmac(
        "sha256",
        process.env.WEBHOOK_SECRET
    );

    const digest =
        "sha256=" +
        hmac.update(req.body).digest("hex");

    const signatureBuffer = Buffer.from(signature);
const digestBuffer = Buffer.from(digest);

const signaturesMatch =
    signatureBuffer.length === digestBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, digestBuffer);

    if (!signaturesMatch) {
        console.log("Rejected webhook: signature mismatch.");
        return res.status(401).send("Invalid signature");
    }

    try {
        req.body = JSON.parse(req.body.toString("utf8"));
    } catch (error) {
        return res.status(400).send("Invalid JSON body");
    }

    console.log("GitHub webhook signature verified.");
    next();
}

// ============================================================
// ADMIN AUTH
// ============================================================

function requireAdminToken(req, res, next) {
    if (!process.env.ADMIN_SECRET) {
        return next();
    }

    const token = req.headers["x-admin-token"];

    if (token !== process.env.ADMIN_SECRET) {
        return res.status(401).json({
            error: "Unauthorized",
        });
    }

    next();
}

// ============================================================
// GITHUB USER → WALLET MAPPING
// ============================================================

function findRegisteredWallet(githubLogin) {
    const users = readJSON(USERS_PATH, []);

    const user = users.find(
        (entry) =>
            entry.githubLogin &&
            entry.githubLogin.toLowerCase() ===
                githubLogin.toLowerCase()
    );

    return user || null;
}

// ============================================================
// DEVTRUST PR LOOKUP
// ============================================================
//
// The GitHub PR number is NOT the same thing as the DevTrust
// PR ID.
//
// GitHub:
//     PR #17
//
// DevTrust:
//     prId = 1
//
// We therefore search the blockchain for the DevTrust record
// whose repository + GitHub PR number match the webhook.
// ============================================================

async function findDevTrustPR(repository, githubPRNumber) {
    try {
        const nextId = await contract.nextPRId();
        const latestId = Number(nextId) - 1;

        if (latestId < 1) {
            return null;
        }

        // Search recent DevTrust PR records.
        // This is appropriate for the current MVP/research
        // implementation. A production implementation would
        // maintain an indexed off-chain mapping.
        for (let prId = latestId; prId >= 1; prId--) {
            try {
                const basic = await contract.getPRBasic(prId);

                const storedRepository = basic[1];
                const storedPRNumber = Number(basic[2]);

                if (
                    storedRepository === repository &&
                    storedPRNumber === Number(githubPRNumber)
                ) {
                    return {
                        prId,
                        data: basic,
                    };
                }
            } catch (error) {
                console.error(
                    `Could not read DevTrust PR ${prId}:`,
                    error.shortMessage || error.message
                );
            }
        }

        return null;
    } catch (error) {
        console.error(
            "DevTrust PR lookup failed:",
            error.shortMessage || error.message
        );

        throw error;
    }
}

// ============================================================
// DATABASE QUEUE
// ============================================================

function addBlockchainJob(job) {
    const db = readJSON(DB_PATH, []);

    const existing = db.find(
        (item) =>
            item.prId === job.prId &&
            item.type === job.type
    );

    if (existing) {
        console.log(
            `Job already exists for DevTrust PR #${job.prId}.`
        );

        return existing;
    }

    const entry = {
        ...job,
        status: "PENDING_BLOCKCHAIN",
        retries: 0,
        createdAt: new Date().toISOString(),
    };

    db.push(entry);
    writeJSON(DB_PATH, db);

    console.log(
        `Blockchain job added: ${job.type} for DevTrust PR #${job.prId}`
    );

    return entry;
}

// ============================================================
// GITHUB OAUTH
// ============================================================

app.get("/auth/github", (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        redirect_uri: process.env.GITHUB_REDIRECT_URI,
        scope: "read:user",
    });

    res.redirect(
        `https://github.com/login/oauth/authorize?${params}`
    );
});

app.get("/auth/github/callback", async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.redirect(
            `${FRONTEND_URL}?auth_error=true`
        );
    }

    try {
        const tokenRes = await fetch(
            "https://github.com/login/oauth/access_token",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    client_id:
                        process.env.GITHUB_CLIENT_ID,
                    client_secret:
                        process.env.GITHUB_CLIENT_SECRET,
                    code,
                    redirect_uri:
                        process.env.GITHUB_REDIRECT_URI,
                }),
            }
        );

        const tokenData = await tokenRes.json();

        const {
            access_token,
            error,
        } = tokenData;

        if (error || !access_token) {
            console.error(
                "GitHub OAuth error:",
                error
            );

            return res.redirect(
                `${FRONTEND_URL}?auth_error=true`
            );
        }

        const userRes = await fetch(
            "https://api.github.com/user",
            {
                headers: {
                    Authorization:
                        `Bearer ${access_token}`,
                    Accept: "application/json",
                },
            }
        );

        const user = await userRes.json();

        const frontendParams =
            new URLSearchParams({
                github_id: user.id.toString(),
                github_login: user.login,
                github_avatar: user.avatar_url || "",
                github_name:
                    user.name || user.login,
            });

        res.redirect(
            `${FRONTEND_URL}?${frontendParams}`
        );
    } catch (error) {
        console.error(
            "GitHub callback error:",
            error
        );

        res.redirect(
            `${FRONTEND_URL}?auth_error=true`
        );
    }
});

// ============================================================
// GITHUB WEBHOOK
// ============================================================

app.post(
    "/webhook",
    verifySignature,
    async (req, res) => {
        console.log("\n==============================");
        console.log("GitHub webhook received");

        const event =
            req.headers["x-github-event"];

        console.log("Event:", event);

        if (event !== "pull_request") {
            console.log(
                "Ignoring non-pull-request event."
            );

            return res.status(200).send("Ignored");
        }

        const {
            action,
            pull_request,
            repository,
        } = req.body;

        console.log("Action:", action);

        if (!pull_request || !repository) {
            return res
                .status(400)
                .send("Invalid GitHub payload");
        }

        // We only need to process a PR when it is closed.
        if (action !== "closed") {
            return res
                .status(200)
                .send("Pull request event received");
        }

        const githubPRNumber =
            pull_request.number;

        const githubLogin =
            pull_request.user?.login;

        const repositoryFullName =
            repository.full_name;

        const mergeCommit =
            pull_request.merge_commit_sha;

        console.log(
            "Repository:",
            repositoryFullName
        );

        console.log(
            "GitHub PR:",
            githubPRNumber
        );

        console.log(
            "GitHub author:",
            githubLogin
        );

        // --------------------------------------------------------
        // Look up wallet using GitHub username.
        // --------------------------------------------------------

        const registeredUser =
            findRegisteredWallet(githubLogin);

        if (!registeredUser) {
            console.log(
                `No wallet registered for GitHub user ${githubLogin}.`
            );

            return res
                .status(200)
                .send("GitHub user has no registered wallet");
        }

        console.log(
            "Registered wallet:",
            registeredUser.walletAddress
        );

        // --------------------------------------------------------
        // Find corresponding DevTrust PR.
        // --------------------------------------------------------

        let devTrustPR;

        try {
            devTrustPR =
                await findDevTrustPR(
                    repositoryFullName,
                    githubPRNumber
                );
        } catch (error) {
            console.error(
                "Could not locate DevTrust PR."
            );

            return res
                .status(500)
                .send("Blockchain lookup failed");
        }

        if (!devTrustPR) {
            console.log(
                `No DevTrust PR found for ${repositoryFullName}#${githubPRNumber}`
            );

            return res
                .status(200)
                .send("No matching DevTrust PR");
        }

        const devTrustPRId =
            devTrustPR.prId;

        console.log(
            `Matched GitHub PR #${githubPRNumber} ` +
            `to DevTrust PR #${devTrustPRId}`
        );

        // --------------------------------------------------------
        // Verify only MERGED PRs.
        // --------------------------------------------------------
        //
        // A PR closed without merging is NOT automatically
        // rejected on-chain. The v2 contract requires the
        // company/maintainer to make the final approve/reject
        // decision after the challenge period.
        // --------------------------------------------------------

        if (pull_request.merged === true) {
            if (!mergeCommit) {
                console.log(
                    "Merged PR has no merge commit SHA."
                );

                return res
                    .status(400)
                    .send("Missing merge commit");
            }

            console.log(
                `PR #${githubPRNumber} was merged.`
            );

            addBlockchainJob({
                prId: devTrustPRId,
                type: "VERIFY_MERGED",
                repository: repositoryFullName,
                githubPRNumber,
                githubLogin,
                walletAddress:
                    registeredUser.walletAddress,
                mergeCommit,
            });
        } else {
            console.log(
                `PR #${githubPRNumber} was closed without merging.`
            );

            // No blockchain transaction is triggered here.
            // Company rejection remains a separate v2 action.
        }

        return res
            .status(200)
            .send("Webhook processed");
    }
);

// ============================================================
// WALLET REGISTRATION
// ============================================================

app.post("/api/register-wallet", (req, res) => {
    try {
        const {
            githubLogin,
            walletAddress,
        } = req.body;

        if (!githubLogin || !walletAddress) {
            return res.status(400).json({
                error:
                    "GitHub username and wallet address are required",
            });
        }

        if (
            !/^0x[a-fA-F0-9]{40}$/.test(
                walletAddress
            )
        ) {
            return res.status(400).json({
                error:
                    "Invalid Ethereum wallet address",
            });
        }

        const users =
            readJSON(USERS_PATH, []);

        const existingUser =
            users.find(
                (user) =>
                    user.githubLogin &&
                    user.githubLogin.toLowerCase() ===
                        githubLogin.toLowerCase()
            );

        if (existingUser) {
            existingUser.walletAddress =
                walletAddress;

            existingUser.updatedAt =
                new Date().toISOString();
        } else {
            users.push({
                githubLogin,
                walletAddress,
                registeredAt:
                    new Date().toISOString(),
            });
        }

        writeJSON(USERS_PATH, users);

        console.log(
            `Wallet registered: ${githubLogin} → ${walletAddress}`
        );

        return res.json({
            success: true,
            githubLogin,
            walletAddress,
        });
    } catch (error) {
        console.error(
            "Wallet registration error:",
            error
        );

        return res.status(500).json({
            error:
                "Failed to register wallet",
        });
    }
});

// ============================================================
// LOOK UP DEVTRUST PR
// ============================================================

app.get("/api/pr", async (req, res) => {
    try {
        const {
            repository,
            prNumber,
        } = req.query;

        if (!repository || !prNumber) {
            return res.status(400).json({
                error:
                    "repository and prNumber are required",
            });
        }

        const result =
            await findDevTrustPR(
                repository,
                Number(prNumber)
            );

        if (!result) {
            return res.status(404).json({
                error:
                    "DevTrust PR not found",
            });
        }

        return res.json(JSON.parse(JSON.stringify(result, (_, value) =>
    typeof value === "bigint" ? value.toString() : value
)));
    } catch (error) {
        console.error(
            "PR lookup error:",
            error
        );

        return res.status(500).json({
            error:
                "Failed to look up DevTrust PR",
        });
    }
});

// ============================================================
// BLOCKCHAIN JOB / LOGS
// ============================================================

app.get("/api/logs", (req, res) => {
    const data =
        readJSON(DB_PATH, []);

    res.json(data);
});

// ============================================================
// ADMIN LOGS
// ============================================================

app.get(
    "/admin/logs",
    requireAdminToken,
    adminLimiter,
    async (req, res) => {
        const db =
            readJSON(DB_PATH, []);

        try {
            const balance =
                await provider.getBalance(
                    oracleWallet.address
                );

            const contractOracle =
                await contract.oracle();

            res.json({
                contract:
                    process.env.CONTRACT_ADDRESS,

                oracle_address:
                    oracleWallet.address,

                contract_oracle:
                    contractOracle,

                oracle_balance:
                    ethers.formatEther(
                        balance
                    ) + " ETH",

                total_jobs:
                    db.length,

                pending:
                    db.filter(
                        (job) =>
                            job.status ===
                            "PENDING_BLOCKCHAIN"
                    ).length,

                completed:
                    db.filter(
                        (job) =>
                            job.status ===
                            "COMPLETED"
                    ).length,

                failed:
                    db.filter(
                        (job) =>
                            job.status ===
                            "FAILED"
                    ).length,

                data: db,
            });
        } catch (error) {
            console.error(
                "Admin log error:",
                error
            );

            res.json({
                total_jobs:
                    db.length,
                data: db,
            });
        }
    }
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/", async (req, res) => {
    try {
        const network =
            await provider.getNetwork();

        const code =
            await provider.getCode(
                process.env.CONTRACT_ADDRESS
            );

        res.json({
            service:
                "DevTrust Backend",
            version: "2",
            status: "running",

            contract:
                process.env.CONTRACT_ADDRESS,

            oracle:
                oracleWallet.address,

            chainId:
                network.chainId.toString(),

            contractDeployed:
                code !== "0x",
        });
    } catch (error) {
        res.status(500).json({
            service:
                "DevTrust Backend",
            version: "2",
            status:
                "blockchain connection failed",
            error:
                error.message,
        });
    }
});

// ============================================================
// BLOCKCHAIN PROCESSOR
// ============================================================

const MAX_RETRIES = 3;

async function processQueue() {
    let db =
        readJSON(DB_PATH, []);

    const pending =
        db.filter(
            (job) =>
                job.status ===
                    "PENDING_BLOCKCHAIN" ||
                (
                    job.status === "FAILED" &&
                    (job.retries || 0) <
                        MAX_RETRIES
                )
        );

    if (pending.length === 0) {
        return;
    }

    const balance =
        await provider.getBalance(
            oracleWallet.address
        );

    const balanceEth =
        parseFloat(
            ethers.formatEther(balance)
        );

    console.log(
        `Oracle balance: ${balanceEth} ETH`
    );

    if (balanceEth < 0.001) {
        console.log(
            `Low oracle gas balance. Wallet: ${oracleWallet.address}`
        );

        return;
    }

    for (const job of pending) {
        try {
            let tx;

            // ----------------------------------------------------
            // MERGED PR VERIFICATION
            // ----------------------------------------------------

            if (
                job.type ===
                "VERIFY_MERGED"
            ) {
                console.log(
                    `Verifying merged DevTrust PR #${job.prId}`
                );

                tx =
                    await contract.verifyPRMerged(
                        job.prId,
                        job.mergeCommit
                    );
            }

            // ----------------------------------------------------
            // UNKNOWN JOB TYPE
            // ----------------------------------------------------

            else {
                console.warn(
                    `Unknown blockchain job type: ${job.type}`
                );

                job.status = "FAILED";
                job.error =
                    "Unknown blockchain job type";

                continue;
            }

            console.log(
                "Waiting for blockchain confirmation..."
            );

            const receipt =
                await tx.wait();

            job.status =
                "COMPLETED";

            job.txHash =
                receipt.hash;

            job.completedAt =
                new Date().toISOString();

            console.log(
                `Blockchain transaction confirmed: ${receipt.hash}`
            );
        } catch (error) {
            job.retries =
                (job.retries || 0) + 1;

            job.error =
                error.shortMessage ||
                error.message;

            if (
                job.retries >=
                MAX_RETRIES
            ) {
                job.status =
                    "FAILED";

                console.error(
                    `Job for DevTrust PR #${job.prId} failed permanently.`
                );
            } else {
                job.status =
                    "PENDING_BLOCKCHAIN";

                console.error(
                    `Job for DevTrust PR #${job.prId} failed ` +
                    `(attempt ${job.retries}/${MAX_RETRIES}).`
                );
            }
        }
    }

    writeJSON(DB_PATH, db);
}

// ============================================================
// START SERVER
// ============================================================

setInterval(
    () => {
        processQueue().catch(
            (error) => {
                console.error(
                    "Blockchain processor error:",
                    error
                );
            }
        );
    },
    10000
);

app.listen(PORT, () => {
    console.log("");
    console.log(
        "========================================"
    );
    console.log(
        "DevTrust Backend v2"
    );
    console.log(
        "========================================"
    );
    console.log(
        `Server: http://localhost:${PORT}`
    );
    console.log(
        `Contract: ${process.env.CONTRACT_ADDRESS}`
    );
    console.log(
        `Oracle: ${oracleWallet.address}`
    );
    console.log(
        `Frontend: ${FRONTEND_URL}`
    );
    console.log(
        "Blockchain processor: active"
    );
    console.log(
        "========================================"
    );
    console.log("");
});