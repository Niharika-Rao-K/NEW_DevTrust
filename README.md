# DevTrust

A decentralized developer reputation system on Ethereum Sepolia. Developers stake ETH, submit GitHub PRs for verification, and build on-chain reputation. Two parts, run together:

| | |
|---|---|
| **Backend** (`devtrust-backend`) | Express oracle server — bridges GitHub PRs to the Sepolia smart contract |
| **Frontend** (`futuristic-web3`) | React 19 + Vite app — wallet connect, staking, live dashboard |
| **Contract** | `DevTrust.sol`, already deployed to Sepolia |

---

## 1. Prerequisites

Install these before doing anything else:

- **Node.js v18 or newer** — [nodejs.org](https://nodejs.org). Check with `node -v`.
- **npm** (comes with Node) — used for the backend.
- **pnpm** — used for the frontend (`npm install -g pnpm`).
- **Git**
- **MetaMask** (or another wallet browser extension) — [metamask.io](https://metamask.io)
- A code editor (VS Code recommended)

You'll also need:
- **Sepolia test ETH** — free from a faucet (see step 6). Needed to stake/interact with the contract.
- **A WalletConnect Project ID** — free, see step 7.

---

## 2. Clone the repo

```bash
git clone <your-repo-url>
cd devtrust
```

(If you're setting this up as a fresh repo from the two zips, see the structure below first.)

## 3. Repo structure

This project currently lives as two separate folders/zips. If you haven't already, put them side by side in one repo like this:

```
devtrust/
├── package.json   ← root setup script (see below)
├── backend/      (currently "devtrust-merged")
└── frontend/     (currently "futuristic-web3")
```

> ⚠️ Before pushing to GitHub: delete any `node_modules/` folders from the zips first (don't commit them — they're huge and get reinstalled with `npm install` / `pnpm install`). Also double check `.env` is **not** included — see the warning in step 4.

### One-command install

Drop the provided root `package.json` in the `devtrust/` folder (next to `backend/` and `frontend/`, not inside either). Once `pnpm` is installed globally (step 1), run this once from the repo root:

```bash
npm run setup
```

This installs both `backend`'s npm dependencies and `frontend`'s pnpm dependencies in one go — no need to `cd` into each folder separately. You still need to set up the `.env` / `.env.local` files manually (steps 4 and 5) since those contain secrets that shouldn't be automated or shared via a script.

Two bonus convenience scripts are included too:
```bash
npm run dev:backend    # same as: cd backend && npm start
npm run dev:frontend   # same as: cd frontend && pnpm dev
```
(You'll still want two terminals to run both at once — see step 10.)

---

## 4. Backend setup

Each teammate deploys their **own backend instance to Render** rather than running it locally. Steps:

### 4.1 Install locally first (needed either way, for editing code)

```bash
cd backend
npm install
```

### 4.2 Deploy to Render

1. Go to [render.com](https://render.com) → sign up/log in with GitHub.
2. **New +** → **Web Service** → connect your GitHub account → select the `devtrust` repo.
3. Set:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free is fine for testing
4. Under **Environment**, add these variables (same as what would go in a local `.env`):

```env
PORT=3000
RPC_URL=your_sepolia_rpc_url_here          # from Alchemy or Infura
PRIVATE_KEY=your_wallet_private_key_here   # see oracle note below
CONTRACT_ADDRESS=0x...                     # deployed DevTrust contract address — same for everyone
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=https://your-service-name.onrender.com/auth/github/callback
FRONTEND_URL=http://localhost:5173         # or your deployed frontend URL if you host that too
WEBHOOK_SECRET=choose_your_own_secret
```

5. Click **Create Web Service**. Render builds and deploys — your backend will be live at `https://your-service-name.onrender.com`.
6. Copy that URL — you'll need it in the frontend setup (step 5) and GitHub OAuth setup (step 8).

> ⚠️ **Free tier spins down after inactivity.** The first request after idle time can take 30–60 seconds to respond. Don't worry, it's not broken — just slow to wake up.

> 🚨 **Oracle authorization — read this before deploying:** the smart contract only allows **one wallet address** at a time to act as the authorized oracle (the one set via `set-oracle.js`). If every teammate deploys their own backend with a *different* `PRIVATE_KEY`, only whichever address is currently set as the oracle on-chain will succeed at writing PR verification results — everyone else's backend will throw `Not authorized` errors on those calls (you'll see this show up in `db.json` as failed transactions). Decide as a team:
> - **Option A (recommended for now):** everyone uses the *same* `PRIVATE_KEY` (the current oracle wallet) in their Render env vars, so all deployed backends can actually write on-chain. Share it over a private channel, never in the repo.
> - **Option B:** only one "official" deployment acts as the real oracle; everyone else's Render backend is for testing the API/frontend integration only, and oracle-writing calls are expected to fail on theirs.

If you'd rather run the backend locally instead of on Render (e.g. for quick debugging), copy `.env.example` to `.env`, fill in the same values with `localhost` URLs, and run `npm start` — server runs on `http://localhost:3000`.

> 🔒 **Never commit `.env` or paste real values into Render's env vars section in a screenshot/shared doc.** `.env` is already in `.gitignore` — keep it that way.

---

## 5. Frontend setup

```bash
cd frontend
pnpm install
```

> Note: this project uses **pnpm** (there's a `pnpm-lock.yaml`), not npm — using `npm install` here can produce a mismatched lockfile. Stick to pnpm for this folder.

Create `.env.local` in `frontend/`:

```bash
cp .env.example .env.local
```

Fill in:

```env
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id_here
VITE_BACKEND_URL=https://your-service-name.onrender.com
```

Use the **Render URL from your own backend deployment** (step 4.2) here — not `localhost`, unless you're running the backend locally for quick debugging instead.

Also add a `.gitignore` to this folder if it doesn't have one yet, at minimum:
```
node_modules/
.env.local
dist/
```

Run it:

```bash
pnpm dev
```

Frontend runs on `http://localhost:5173`.

---

## 6. Get Sepolia test ETH

You'll need a small amount of Sepolia ETH in your MetaMask wallet to stake or interact with the contract:

1. In MetaMask: Settings → Advanced → turn on **"Show test networks"**. Sepolia will then appear in the network dropdown — select it.
2. Get free test ETH from a faucet — e.g. https://sepoliafaucet.com or https://www.alchemy.com/faucets/ethereum-sepolia. You'll need to paste in your wallet address.

---

## 7. Get a WalletConnect Project ID

1. Go to https://cloud.walletconnect.com and sign up (free).
2. Create a new project.
3. Copy the **Project ID** into `VITE_WALLETCONNECT_PROJECT_ID` in `frontend/.env.local`.

---

## 8. GitHub OAuth app (for PR verification / login)

Each teammate deploying their own Render backend should set up their **own OAuth app**, matching their own Render URL:

1. GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**.
2. Homepage URL: `http://localhost:5173` (or your deployed frontend URL, if you host that too).
3. Authorization callback URL: `https://your-service-name.onrender.com/auth/github/callback` — use **your own** Render URL from step 4.2.
4. Copy the generated **Client ID** and **Client Secret** into your backend's Render environment variables (not a local `.env`, unless you're running the backend locally).

---

## 9. Smart contract

- Contract: `backend/contracts/DevTrust.sol`
- ABI (already compiled): `backend/DevTrust.json`
- Currently deployed to **Sepolia** — the address goes in `backend/.env` (`CONTRACT_ADDRESS`) **and** `frontend/src/web3/constants.ts` (`CONTRACT_ADDRESS`).

> ⚠️ **Double-check these two addresses match.** As of this writing they don't — sync them before testing staking/dashboard features, or transactions will fail silently or hit the wrong contract.

You generally won't need to redeploy the contract unless you're changing its logic. If you do:
- `scripts/deploy.js` uses Hardhat, which isn't currently in `package.json` — install it first: `npm install --save-dev hardhat`.
- After deploying, update the contract address in both `.env` files/`constants.ts` above.

### One-time admin step: setting the oracle address

The contract has an `oracle` role — the address allowed to write PR verification results on-chain. This only needs to be run once per deployment (already done for the current live contract, but you'll need it again if you redeploy):

```bash
cd backend
npm run set-oracle
```

By default this sets the oracle to the address hardcoded in `set-oracle.js`. To target a different address, set `ORACLE_ADDRESS` in `.env` first. Only the contract **owner** wallet (the one used to deploy it) can run this successfully — anyone else will get a `Not authorized` error.

---

## 10. Running everything together

Your backend runs on Render (step 4), always on (aside from free-tier spin-down delays). You only need to run the frontend locally:

```bash
cd frontend && pnpm dev
```

Then open `http://localhost:5173`, connect your wallet (Sepolia network), and you should see the dashboard talking to your Render backend.

If you're instead running the backend locally for debugging, open two terminals:

```bash
# Terminal 1
cd backend && npm start

# Terminal 2
cd frontend && pnpm dev
```

---

## 11. Troubleshooting

| Issue | Likely cause |
|---|---|
| Wallet won't connect | MetaMask not switched to Sepolia network |
| Staking transaction fails | No Sepolia ETH in wallet, or contract address mismatch (see step 9) |
| PR verification write fails with "Not authorized" | Your Render backend's `PRIVATE_KEY` isn't the wallet currently set as oracle on-chain — see the oracle note in step 4.2 |
| First request to Render backend is very slow (30–60s) | Free tier spun down from inactivity — this is normal, not a bug |
| CORS error in browser console | `FRONTEND_URL` env var on Render doesn't match the frontend's actual URL |
| GitHub OAuth redirect fails | `GITHUB_REDIRECT_URI` doesn't match the callback URL registered in your GitHub OAuth app, or you're using someone else's Render URL by mistake |
| Frontend can't reach backend at all | `VITE_BACKEND_URL` in `.env.local` doesn't match your actual Render service URL, or the Render service is down/still deploying |
| `npm install` fails oddly in frontend | Should be `pnpm install`, not `npm install` |

---

## 12. Tech stack reference

**Backend:** Node.js, Express 5, ethers.js v6, Octokit (GitHub API), dotenv
**Frontend:** React 19, TypeScript, Vite 6, wagmi, viem, RainbowKit, Tailwind CSS, TanStack Query
**Contract:** Solidity ^0.8.28, deployed on Ethereum Sepolia

Testing DevTrust webhook integration
