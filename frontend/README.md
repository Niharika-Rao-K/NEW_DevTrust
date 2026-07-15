# DevTrust — Futuristic Web3 Landing Page (Fully Functional)

A futuristic, fully wired Web3 frontend for the **DevTrust** decentralized developer reputation system. Combines the polished Figma-exported landing page design with live on-chain interactions via wagmi, viem, and RainbowKit.

## What's New vs the Original Landing Page

| Feature | Before | After |
|---|---|---|
| Wallet Connect | Placeholder button | Real RainbowKit multi-wallet connect |
| Staking | Static UI | Live `stake()` call to DevTrust contract |
| PR Verification | Static text | Queries Member B's backend in real-time |
| Contribution Feed | Hardcoded copy | Reads live records from the smart contract |
| Stats | Hardcoded numbers | `getTotalRecords()` live from chain |

## Setup

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local
# Fill in VITE_WALLETCONNECT_PROJECT_ID and VITE_BACKEND_URL

# 3. Set contract address in src/web3/constants.ts

# 4. Run
npm run dev
```

## New Files Added

```
src/web3/
├── config.ts               # wagmi + WalletConnect setup
├── Web3Provider.tsx        # RainbowKit + wagmi + react-query providers
├── constants.ts            # Contract address, ABI, config values
├── hooks.ts                # useStake, useIsStaked, useTotalRecords, etc.
├── ConnectWalletButton.tsx # Custom styled connect button (nav/hero/inline)
├── DashboardSection.tsx    # Full stake + PR verify + stats UI
└── ContributionFeed.tsx    # Live feed reading from smart contract
```

## Network

Configured for **Sepolia testnet**. Get free ETH at https://sepoliafaucet.com
