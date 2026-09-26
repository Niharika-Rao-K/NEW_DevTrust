const { ethers } = require("hardhat");

async function main() {
    console.log("Deploying DevTrust v3...");

    const [deployer] = await ethers.getSigners();

    console.log("Deployer address:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

    // 120 seconds = 2 minutes.
    // This is the DEMO deployment.
    const challengePeriod = 120;

    console.log("Challenge period:", challengePeriod, "seconds");

    const DevTrust = await ethers.getContractFactory("contracts/DevTrustv3.sol:DevTrust");

    const devTrust = await DevTrust.deploy(
        "DevTrust Protocol v3 Demo",
        challengePeriod
    );

    console.log("Waiting for deployment confirmation...");

    await devTrust.waitForDeployment();

    const contractAddress = await devTrust.getAddress();
    const deploymentTx = devTrust.deploymentTransaction();

    console.log("");
    console.log("========================================");
    console.log("DevTrust v3 deployed successfully!");
    console.log("========================================");
    console.log("Contract address:", contractAddress);
    console.log(
        "Transaction hash:",
        deploymentTx ? deploymentTx.hash : "Unavailable"
    );

    // Verify deployment details
    const trustName = await devTrust.trustName();
    const creationTime = await devTrust.creationTime();
    const owner = await devTrust.owner();
    const oracle = await devTrust.oracle();
    const treasury = await devTrust.treasury();
    const deployedChallengePeriod = await devTrust.challengePeriod();
    const nextPRId = await devTrust.nextPRId();

    console.log("");
    console.log("Trust Name:", trustName);
    console.log("Creation Time:", creationTime.toString());
    console.log("Owner:", owner);
    console.log("Oracle:", oracle);
    console.log("Treasury:", treasury);
    console.log(
        "Challenge Period:",
        deployedChallengePeriod.toString(),
        "seconds"
    );
    console.log("Next PR ID:", nextPRId.toString());
    console.log("Deployer:", deployer.address);

    console.log("");
    console.log("SAVE THESE VALUES:");
    console.log("CONTRACT_ADDRESS =", contractAddress);
    console.log("DEPLOYMENT_TX =", deploymentTx ? deploymentTx.hash : "Unavailable");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:");
        console.error(error);
        process.exit(1);
    });