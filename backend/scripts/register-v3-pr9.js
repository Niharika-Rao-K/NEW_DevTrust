const { ethers } = require("ethers");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

const ABI = [
    "function registerPR(string repository,uint256 prNumber,string prUrl,address company,uint256 reviewerRewardPool,uint256 minReviewerStake) payable returns (uint256)",
    "function nextPRId() view returns (uint256)"
];

async function main() {
    const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        ABI,
        wallet
    );

    console.log("Using V3 contract:", CONTRACT_ADDRESS);
    console.log("Developer/oracle wallet:", wallet.address);

    const tx = await contract.registerPR(
        "Niharika-Rao-K/NEW_DevTrust",
        9,
        "https://github.com/Niharika-Rao-K/NEW_DevTrust/pull/9",
        "0xC0ca187306FD925346803aCCFa82ca8fd722460E",
        ethers.parseEther("0.001"),
        ethers.parseEther("0.001"),
        {
            value: ethers.parseEther("0.002")
        }
    );

    console.log("Transaction:", tx.hash);

    const receipt = await tx.wait();

    console.log("Confirmed in block:", receipt.blockNumber);
    console.log("Next PR ID:", (await contract.nextPRId()).toString());
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
