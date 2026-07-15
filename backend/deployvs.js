/**
 * deploy-v2.js — Deploy DevTrustV2.sol to Sepolia
 *
 * Usage:
 *   1. Set DEPLOYER_PRIVATE_KEY and SEPOLIA_RPC_URL in your .env
 *   2. node deploy-v2.js
 *   3. Copy the printed contract address into .env as VITE_CONTRACT_ADDRESS_V2
 *   4. Run: node set-oracle-v2.js <CONTRACT_ADDRESS_V2> to set the oracle
 */

require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ─── Minimal ABI for deployment check ────────────────────────────────────────
// You'll compile DevTrustV2.sol with solc or Remix first, then paste the bytecode here.
// For convenience, this script uses Remix's compile output if you drop it next to this file.

async function main() {
  const rpcUrl    = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    console.error("❌ Set SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet   = new ethers.Wallet(privateKey, provider);
  console.log(`🔑 Deploying from: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);

  // ─── Load compiled artifact ────────────────────────────────────────────────
  // Option A: drop DevTrustV2.json (Remix compile output) next to this file
  // Option B: compile with solc (see README)
  let abi, bytecode;
  const artifactPath = path.join(__dirname, "DevTrustV2.json");

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    abi      = artifact.abi;
    bytecode = artifact.bytecode ?? artifact.evm?.bytecode?.object;
  } else {
    console.error(`
❌ DevTrustV2.json not found.
   Compile DevTrustV2.sol in Remix → copy the ABI+bytecode → save as DevTrustV2.json
   Format: { "abi": [...], "bytecode": "0x..." }
    `);
    process.exit(1);
  }

  if (!bytecode || bytecode === "0x") {
    console.error("❌ bytecode is empty — did the compilation succeed?");
    process.exit(1);
  }

  // ─── Deploy ────────────────────────────────────────────────────────────────
  console.log("📦 Deploying DevTrustV2...");
  const factory  = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy("DevTrust");
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`\n✅ DevTrustV2 deployed to: ${address}`);
  console.log(`   Tx hash: ${contract.deploymentTransaction()?.hash}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Add to .env:  VITE_CONTRACT_ADDRESS_V2=${address}`);
  console.log(`  2. Run:          node set-oracle-v2.js ${address}`);
  console.log(`  3. Verify:       https://sepolia.etherscan.io/address/${address}`);

  // Auto-write to .env.v2 for convenience
  fs.writeFileSync(".env.v2", `VITE_CONTRACT_ADDRESS_V2=${address}\n`);
  console.log(`\n📝 Also saved to .env.v2 — copy the line to your main .env`);
}

main().catch((e) => { console.error(e); process.exit(1); });