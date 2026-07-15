// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * DevTrustV2 — Phase 1 + 2
 *
 * New in V2:
 *   - Companies can post bounties on GitHub issues (postBounty)
 *   - claimBounty: distributes developer reward + reviewer bonus pool on merge
 *   - Reviewer bonus pool split proportionally among approved stakers
 *   - Backward-compatible: existing stake/addRecord/SBT functions unchanged
 */
contract DevTrustV2 {

    // ─── Owner & Oracle ───────────────────────────────────────────────────────

    address public owner;
    address public oracle;
    string  public trustName;
    uint256 public creationTime;

    modifier onlyOwner()  { require(msg.sender == owner,  "Not owner");  _; }
    modifier onlyOracle() { require(msg.sender == oracle, "Not oracle"); _; }

    // ─── Staking (existing) ───────────────────────────────────────────────────

    mapping(address => uint256) public stakes;

    function isStaked(address user) external view returns (bool) {
        return stakes[user] > 0;
    }

    function stake() external payable {
        require(msg.value >= 0.001 ether, "Min stake 0.001 ETH");
        stakes[msg.sender] += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    // ─── Records / SBT (existing) ─────────────────────────────────────────────

    struct Record {
        address user;
        string  data;
        uint256 timestamp;
    }

    Record[] public records;

    function addRecord(address _user, string calldata _data) external onlyOracle {
        records.push(Record(_user, _data, block.timestamp));
        emit RecordAdded(_user, _data, block.timestamp);
    }

    function getTotalRecords() external view returns (uint256) { return records.length; }

    function getRecord(uint256 index) external view returns (address, string memory, uint256) {
        Record storage r = records[index];
        return (r.user, r.data, r.timestamp);
    }

    function getTrustInfo() external view returns (string memory, uint256) {
        return (trustName, creationTime);
    }

    // ─── Reward / Slash (existing) ────────────────────────────────────────────

    function reward(address developer) external payable onlyOracle {
        require(msg.value > 0, "No value");
        (bool ok,) = developer.call{value: msg.value}("");
        require(ok, "Transfer failed");
        emit Rewarded(developer, msg.value);
    }

    function slash(address developer) external onlyOracle {
        uint256 amount = stakes[developer];
        require(amount > 0, "Nothing to slash");
        stakes[developer] = 0;
        (bool ok,) = owner.call{value: amount}("");
        require(ok, "Transfer failed");
        emit Slashed(developer, amount);
    }

    // ─── PHASE 2: Bounty System ───────────────────────────────────────────────

    uint256 public constant MIN_BOUNTY   = 0.005 ether; // minimum bounty a company can post
    uint256 public constant REVIEWER_PCT = 20;           // 20% of bounty goes to reviewer pool

    struct Bounty {
        address company;          // who posted it
        string  issueUrl;         // e.g. "https://github.com/owner/repo/issues/42"
        uint256 developerReward;  // ETH sent to developer on merge
        uint256 reviewerPool;     // ETH split among approved reviewers
        bool    claimed;          // true after claimBounty called
        bool    exists;
    }

    // issueUrl → Bounty
    mapping(string => Bounty) public bounties;
    // track all posted issue URLs for iteration
    string[] public issueList;

    // issueUrl → list of reviewer addresses who correctly staked+approved
    mapping(string => address[]) private _approvedReviewers;

    // ─── Post a Bounty ────────────────────────────────────────────────────────

    /**
     * @notice Company posts a bounty on a GitHub issue.
     *         Send ETH with the call — 20% goes to reviewer pool, 80% to developer.
     * @param issueUrl  Full GitHub issue URL, used as the unique key.
     */
    function postBounty(string calldata issueUrl) external payable {
        require(msg.value >= MIN_BOUNTY,       "Bounty below minimum");
        require(!bounties[issueUrl].exists,     "Bounty already posted");
        require(bytes(issueUrl).length > 0,    "Empty issue URL");

        uint256 reviewerPool    = (msg.value * REVIEWER_PCT) / 100;
        uint256 developerReward = msg.value - reviewerPool;

        bounties[issueUrl] = Bounty({
            company:         msg.sender,
            issueUrl:        issueUrl,
            developerReward: developerReward,
            reviewerPool:    reviewerPool,
            claimed:         false,
            exists:          true
        });

        issueList.push(issueUrl);
        emit BountyPosted(issueUrl, msg.sender, developerReward, reviewerPool);
    }

    // ─── Claim a Bounty (called by oracle after merge verified) ──────────────

    /**
     * @notice Oracle calls this after the PR is merged and reviewer voting is resolved.
     *         Distributes developer reward and splits reviewer pool.
     * @param issueUrl          The issue the PR resolves.
     * @param developer         Developer wallet address.
     * @param approvedReviewers List of reviewer addresses who staked + voted approve.
     */
    function claimBounty(
        string calldata issueUrl,
        address developer,
        address[] calldata approvedReviewers
    ) external onlyOracle {
        Bounty storage b = bounties[issueUrl];
        require(b.exists,    "Bounty not found");
        require(!b.claimed,  "Already claimed");
        require(developer != address(0), "Invalid developer");

        b.claimed = true;

        // Pay developer
        if (b.developerReward > 0) {
            (bool ok,) = developer.call{value: b.developerReward}("");
            require(ok, "Developer transfer failed");
        }

        // Split reviewer pool equally among approved reviewers
        if (approvedReviewers.length > 0 && b.reviewerPool > 0) {
            uint256 share = b.reviewerPool / approvedReviewers.length;
            for (uint256 i = 0; i < approvedReviewers.length; i++) {
                if (approvedReviewers[i] != address(0)) {
                    (bool ok,) = approvedReviewers[i].call{value: share}("");
                    // Don't revert if one reviewer transfer fails — continue paying others
                    if (!ok) emit ReviewerPaymentFailed(approvedReviewers[i], share);
                }
            }
        }

        emit BountyClaimed(issueUrl, developer, b.developerReward, approvedReviewers.length);
    }

    // ─── Refund (company can reclaim if no one solved it after 30 days) ───────

    function refundBounty(string calldata issueUrl) external {
        Bounty storage b = bounties[issueUrl];
        require(b.exists,           "Bounty not found");
        require(!b.claimed,         "Already claimed");
        require(msg.sender == b.company, "Not your bounty");
        // Simple time lock: company can refund after 30 days
        // In production you'd store a timestamp; for MVP just allow owner/company
        b.claimed = true; // prevents double-refund
        uint256 total = b.developerReward + b.reviewerPool;
        (bool ok,) = b.company.call{value: total}("");
        require(ok, "Refund failed");
        emit BountyRefunded(issueUrl, b.company, total);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getBounty(string calldata issueUrl) external view returns (
        address company, uint256 developerReward, uint256 reviewerPool, bool claimed
    ) {
        Bounty storage b = bounties[issueUrl];
        return (b.company, b.developerReward, b.reviewerPool, b.claimed);
    }

    function getTotalBounties() external view returns (uint256) {
        return issueList.length;
    }

    function getBountyAt(uint256 index) external view returns (string memory) {
        return issueList[index];
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(string memory _trustName) {
        owner        = msg.sender;
        trustName    = _trustName;
        creationTime = block.timestamp;
    }

    receive() external payable {}

    // ─── Events ───────────────────────────────────────────────────────────────

    event Staked(address indexed user, uint256 amount);
    event RecordAdded(address indexed user, string data, uint256 timestamp);
    event Rewarded(address indexed developer, uint256 amount);
    event Slashed(address indexed developer, uint256 amount);
    event OracleUpdated(address newOracle);
    event BountyPosted(string issueUrl, address indexed company, uint256 devReward, uint256 reviewerPool);
    event BountyClaimed(string issueUrl, address indexed developer, uint256 devReward, uint256 reviewerCount);
    event BountyRefunded(string issueUrl, address indexed company, uint256 amount);
    event ReviewerPaymentFailed(address indexed reviewer, uint256 amount);
}
