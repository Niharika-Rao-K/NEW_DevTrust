require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");

const contractPath = "./DevTrust.json";

async function main() {
    if (!fs.existsSync(contractPath)) {
        console.error("❌ DevTrust.json not found.");
        return;
    }

    const contractJson = JSON.parse(fs.readFileSync(contractPath));
    const abi = contractJson.abi;

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const ownerWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, ownerWallet);

    // Change this to whichever address should be the oracle
    const targetOracle = process.env.ORACLE_ADDRESS || "0x2f45eF660233ebD3fE2ff5370fC41A1477f5f400";

    console.log("--- Permission Update ---");
    console.log(`Contract:     ${process.env.CONTRACT_ADDRESS}`);
    console.log(`Acting Owner: ${ownerWallet.address}`);
    console.log(`Setting Oracle to: ${targetOracle}`);
    console.log("-------------------------");

    try {
        const tx = await contract.setOracle(targetOracle);
        console.log("⏳ Transaction sent! Waiting for confirmation...");
        const receipt = await tx.wait();
        console.log(`✅ SUCCESS! Oracle set in block ${receipt.blockNumber}`);
        console.log(`Tx Hash: ${receipt.hash}`);

        const currentOracle = await contract.oracle();
        console.log(`Confirmed Oracle on-chain: ${currentOracle}`);
    } catch (error) {
        console.error("❌ Failed:", error.reason || error.message);
    }
}

main();
