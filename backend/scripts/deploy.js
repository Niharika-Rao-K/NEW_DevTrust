const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying DevTrust contract...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  
  // Get account balance
  const balance = await deployer.getBalance();
  console.log("Account balance:", ethers.utils.formatEther(balance), "ETH");
  
  // Deploy the contract
  const DevTrust = await ethers.getContractFactory("DevTrust");
  const devTrust = await DevTrust.deploy("DevTrust Protocol");
  
  console.log("DevTrust contract address:", devTrust.address);
  console.log("Transaction hash:", devTrust.deployTransaction.hash);
  
  // Wait for deployment confirmation
  await devTrust.deployed();
  console.log("DevTrust contract successfully deployed!");
  
  // Verify contract details
  const trustName = await devTrust.trustName();
  const creationTime = await devTrust.creationTime();
  const owner = await devTrust.owner();
  const oracle = await devTrust.oracle();
  
  console.log("Trust Name:", trustName);
  console.log("Creation Time:", creationTime.toString());
  console.log("Contract Owner:", owner);
  console.log("Oracle Address:", oracle);
  console.log("Deployer Address:", deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
