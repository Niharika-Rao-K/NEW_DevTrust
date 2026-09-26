const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying DevTrust v2...");

  const [deployer] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const DevTrust = await ethers.getContractFactory("DevTrust");

  const devTrust = await DevTrust.deploy("DevTrust Protocol v2");

  await devTrust.waitForDeployment();

  const contractAddress = await devTrust.getAddress();
  const deploymentTx = devTrust.deploymentTransaction();

  console.log("");
  console.log("========================================");
  console.log("DevTrust v2 deployed successfully");
  console.log("========================================");
  console.log("Contract address:", contractAddress);
  console.log("Deployment tx:", deploymentTx ? deploymentTx.hash : "Unavailable");

  console.log("");
  console.log("Contract configuration:");

  console.log("Trust name:", await devTrust.trustName());
  console.log("Owner:", await devTrust.owner());
  console.log("Oracle:", await devTrust.oracle());
  console.log("Treasury:", await devTrust.treasury());
  console.log("Challenge period:", (await devTrust.challengePeriod()).toString(), "seconds");

  console.log("");
  console.log("IMPORTANT: Save the contract address and transaction hash.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
