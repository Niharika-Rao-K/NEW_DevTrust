import { parseAbi } from "viem";

export const CONTRACT_ADDRESS =
  "0x38683719B6EdFa2ba2F48A97C9248b0085cE2b4B" as const;

export const CONTRACT_ABI = parseAbi([
  // --------------------------------------------------
  // PR REGISTRATION
  // --------------------------------------------------

  "function registerPR(string repository, uint256 prNumber, string prUrl, address company, uint256 reviewerRewardPool, uint256 minReviewerStake) payable returns (uint256)",

  // --------------------------------------------------
  // REVIEWER STAKING
  // --------------------------------------------------

  "function stakeOnPR(uint256 prId, bool approveVote) payable",

  // --------------------------------------------------
  // GITHUB ORACLE
  // --------------------------------------------------

  "function verifyPRMerged(uint256 prId, string mergeCommit)",

  // --------------------------------------------------
  // COMPANY DECISION
  // --------------------------------------------------

  "function approvePR(uint256 prId)",
  "function rejectPR(uint256 prId)",

  // --------------------------------------------------
  // SETTLEMENT
  // --------------------------------------------------

  "function settlePR(uint256 prId)",

  // --------------------------------------------------
  // PR INFORMATION
  // --------------------------------------------------

  "function getPRBasic(uint256 prId) view returns (uint256 id, string repository, uint256 prNumber, string prUrl, address developer, address company)",

  "function getPRStaking(uint256 prId) view returns (uint256 developerStake, uint256 reviewerRewardPool, uint256 totalReviewerStake, uint256 reviewerCount)",

  "function getPRStatus(uint256 prId) view returns (uint8 status, uint256 createdAt, uint256 mergedAt, uint256 challengeDeadline, bool settled)",

  "function getPRMergeInfo(uint256 prId) view returns (string repository, uint256 prNumber, string prUrl, string mergeCommit)",

  // --------------------------------------------------
  // V3 TESTING THRESHOLD
  // --------------------------------------------------

  "function getPRThreshold(uint256 prId) view returns (uint256 minReviewerStake, bool testingEligible)",

  "function isEligibleForTesting(uint256 prId) view returns (bool)",

  "function getTestingEligibility(uint256 prId) view returns (uint256 totalReviewerStake, uint256 minReviewerStake, bool testingEligible)",

  // --------------------------------------------------
  // REVIEW INFORMATION
  // --------------------------------------------------

  "function getReview(uint256 prId, address reviewer) view returns (address reviewer, uint256 stake, bool approveVote, bool settled, bool exists)",

  "function getReviewerCount(uint256 prId) view returns (uint256)",

  "function getReviewerAt(uint256 prId, uint256 index) view returns (address)",

  // --------------------------------------------------
  // REPUTATION / SBT
  // --------------------------------------------------

  "function reputation(address developer) view returns (uint256)",

  "function getSBTInfo(uint256 tokenId) view returns (uint256 prId, address developer, uint256 mintedAt)",

  // --------------------------------------------------
  // CONTRACT CONFIGURATION
  // --------------------------------------------------

  "function oracle() view returns (address)",

  "function owner() view returns (address)",

  "function treasury() view returns (address)",

  "function challengePeriod() view returns (uint256)",

  "function nextPRId() view returns (uint256)",

  // --------------------------------------------------
  // EVENTS
  // --------------------------------------------------

  "event PRRegistered(uint256 indexed prId, string repository, uint256 prNumber, address indexed developer, uint256 developerStake, uint256 reviewerRewardPool, uint256 minReviewerStake)",

  "event DeveloperStakeDeposited(uint256 indexed prId, address indexed developer, uint256 amount)",

  "event ReviewerStaked(uint256 indexed prId, address indexed reviewer, uint256 amount, bool approveVote)",

  "event ReviewerStakeThresholdReached(uint256 indexed prId, uint256 totalReviewerStake, uint256 minReviewerStake)",

  "event PRMergeVerified(uint256 indexed prId, string mergeCommit, uint256 timestamp, uint256 challengeDeadline)",

  "event PRApproved(uint256 indexed prId, address indexed company)",

  "event PRRejected(uint256 indexed prId, address indexed company)",

  "event ReviewerRewarded(uint256 indexed prId, address indexed reviewer, uint256 stakeReturned, uint256 reward)",

  "event ReviewerSlashed(uint256 indexed prId, address indexed reviewer, uint256 amount)",

  "event DeveloperStakeReturned(uint256 indexed prId, address indexed developer, uint256 amount)",

  "event DeveloperReputationUpdated(address indexed developer, uint256 newReputation)",

  "event SkillSBTMinted(uint256 indexed tokenId, address indexed developer, uint256 indexed prId)",

  "event PRSettled(uint256 indexed prId, bool approved, uint256 reviewerCount, uint256 totalReviewerStake)",
]);

export const MIN_DEVELOPER_STAKE_ETH = "0.001";

export const MIN_REVIEWER_STAKE_ETH = "0.001";

export const MIN_STAKE_ETH = MIN_REVIEWER_STAKE_ETH;

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";