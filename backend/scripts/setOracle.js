const { ethers } = require("hardhat");

async function main() {
  try {
    const contractAddress = "0x2128E1af9AEA1C2e325CFe5094Ba311D00D1ff3C";
    const oracleAddress = "0x2f45eF660233ebD3fE2ff5370fC41A1477f5f400";

    console.log("Setting oracle...");

    const contract = await ethers.getContractAt("DevTrust", contractAddress);

    const tx = await contract.setOracle(oracleAddress);
    await tx.wait();

    console.log("Oracle updated!");

    const currentOracle = await contract.oracle();
    console.log("Current Oracle:", currentOracle);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();