// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * DevTrust v2
 *
 * Decentralized Peer-Staking / Proof-of-Skill MVP
 *
 * Core workflow:
 *
 * Developer
 *      |
 *      | Register GitHub PR + developer stake
 *      v
 * DevTrust PR
 *      |
 *      | Reviewers stake ETH + vote
 *      v
 * Reviewer Consensus
 *      |
 *      | GitHub Oracle verifies merge
 *      v
 * Company / Maintainer
 *      |
 *      | Approve / Reject
 *      v
 * Settlement
 *
 * APPROVED:
 *   - Developer stake returned
 *   - Correct reviewer stakes returned
 *   - Correct reviewers receive reward
 *   - Incorrect reviewer stakes are slashed
 *   - Developer reputation increases
 *   - Proof-of-Skill SBT minted
 *
 * REJECTED:
 *   - Developer stake returned
 *   - Reviewer stakes are slashed
 *   - No reputation reward
 *   - No SBT
 *
 * The GitHub -> blockchain bridge is performed by the
 * backend/oracle wallet.
 */
contract DevTrust {

    // ============================================================
    //                         ADMIN
    // ============================================================

    string public trustName;
    uint256 public creationTime;

    address public owner;
    address public oracle;
    address public treasury;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Not oracle");
        _;
    }

    modifier onlyOwnerOrOracle() {
        require(
            msg.sender == owner || msg.sender == oracle,
            "Not authorized"
        );
        _;
    }


    // ============================================================
    //                         EVENTS
    // ============================================================

    event OracleUpdated(
        address indexed newOracle
    );

    event TreasuryUpdated(
        address indexed newTreasury
    );

    event RecordAdded(
        address indexed user,
        string data,
        uint256 timestamp
    );

    event Staked(
        address indexed user,
        uint256 amount
    );

    event DeveloperStakeDeposited(
        uint256 indexed prId,
        address indexed developer,
        uint256 amount
    );

    event ReviewerStaked(
        uint256 indexed prId,
        address indexed reviewer,
        uint256 amount,
        bool approveVote
    );

    event PRRegistered(
        uint256 indexed prId,
        string repository,
        uint256 prNumber,
        address indexed developer,
        uint256 developerStake,
        uint256 reviewerRewardPool
    );

    event PRMergeVerified(
        uint256 indexed prId,
        string mergeCommit,
        uint256 timestamp
    );

    event PRApproved(
        uint256 indexed prId,
        address indexed company
    );

    event PRRejected(
        uint256 indexed prId,
        address indexed company
    );

    event ReviewerRewarded(
        uint256 indexed prId,
        address indexed reviewer,
        uint256 stakeReturned,
        uint256 reward
    );

    event ReviewerSlashed(
        uint256 indexed prId,
        address indexed reviewer,
        uint256 amount
    );

    event DeveloperStakeReturned(
        uint256 indexed prId,
        address indexed developer,
        uint256 amount
    );

    event DeveloperReputationUpdated(
        address indexed developer,
        uint256 newReputation
    );

    event SkillSBTMinted(
        uint256 indexed tokenId,
        address indexed developer,
        uint256 indexed prId
    );

    event PRSettled(
        uint256 indexed prId,
        bool approved,
        uint256 reviewerCount,
        uint256 totalReviewerStake
    );

    event Slashed(
        address indexed developer,
        uint256 amount
    );

    event Rewarded(
        address indexed developer,
        uint256 amount
    );

    event Transfer(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId
    );


    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        string memory _trustName
    ) {
        trustName = _trustName;
        creationTime = block.timestamp;

        owner = msg.sender;
        oracle = msg.sender;
        treasury = msg.sender;
    }


    // ============================================================
    //                    LEGACY RECORD SYSTEM
    // ============================================================

    /**
     * Kept for compatibility with the original contract.
     *
     * This is separate from the PR staking workflow.
     */
    struct TrustRecord {
        address user;
        string data;
        uint256 timestamp;
    }

    TrustRecord[] public records;

    function addRecord(
        address _user,
        string calldata _data
    )
        external
        onlyOwnerOrOracle
    {
        require(
            _user != address(0),
            "Invalid user"
        );

        records.push(
            TrustRecord({
                user: _user,
                data: _data,
                timestamp: block.timestamp
            })
        );

        emit RecordAdded(
            _user,
            _data,
            block.timestamp
        );
    }

    function getRecord(
        uint256 index
    )
        external
        view
        returns (
            address user,
            string memory data,
            uint256 timestamp
        )
    {
        require(
            index < records.length,
            "Invalid index"
        );

        TrustRecord storage record =
            records[index];

        return (
            record.user,
            record.data,
            record.timestamp
        );
    }

    function getTotalRecords()
        external
        view
        returns (uint256)
    {
        return records.length;
    }

    function getTrustInfo()
        external
        view
        returns (
            string memory,
            uint256
        )
    {
        return (
            trustName,
            creationTime
        );
    }


    // ============================================================
    //                  GENERIC PLATFORM STAKE
    // ============================================================

    /**
     * Legacy/general platform stake.
 *
     * This is NOT reviewer stake for a PR.
     *
     * PR-specific reviewer staking uses stakeOnPR().
     */
    mapping(address => uint256)
        public stakes;

    uint256 public constant MIN_PLATFORM_STAKE =
        0.001 ether;

    function stake()
        external
        payable
    {
        require(
            msg.value >= MIN_PLATFORM_STAKE,
            "Minimum stake is 0.001 ETH"
        );

        stakes[msg.sender] += msg.value;

        emit Staked(
            msg.sender,
            msg.value
        );
    }

    function isStaked(
        address user
    )
        external
        view
        returns (bool)
    {
        return stakes[user] > 0;
    }


    // ============================================================
    //                       PR SYSTEM
    // ============================================================

    enum PRStatus {
        NONE,
        OPEN,
        MERGED,
        APPROVED,
        REJECTED,
        SETTLED
    }

    struct PullRequest {

        uint256 id;

        string repository;

        uint256 prNumber;

        string prUrl;

        address developer;

        uint256 developerStake;

        uint256 reviewerRewardPool;

        uint256 totalReviewerStake;

        uint256 reviewerCount;

        PRStatus status;

        address company;

        uint256 createdAt;

        uint256 mergedAt;

        uint256 challengeDeadline;

        string mergeCommit;

        bool settled;
    }

    uint256 public nextPRId = 1;

    mapping(uint256 => PullRequest)
        public pullRequests;


    // ============================================================
    //                       REVIEW SYSTEM
    // ============================================================

    struct Review {

        address reviewer;

        uint256 stake;

        bool approveVote;

        bool settled;

        bool exists;
    }

    mapping(
        uint256 => mapping(address => Review)
    )
        public reviews;

    mapping(uint256 => address[])
        private reviewerList;


    // ============================================================
    //                     CONFIGURATION
    // ============================================================

    uint256 public constant MIN_DEVELOPER_STAKE =
        0.001 ether;

    uint256 public constant MIN_REVIEWER_STAKE =
        0.001 ether;

    uint256 public challengePeriod =
        1 days;

    uint256 public constant MAX_REVIEWERS =
        50;


    // ============================================================
    //                     REPUTATION
    // ============================================================

    mapping(address => uint256)
        public reputation;

    uint256 public constant REPUTATION_PER_SUCCESS =
        100;


    // ============================================================
    //                  SOULBOUND TOKEN SYSTEM
    // ============================================================

    string public constant SBT_NAME =
        "DevTrust Proof of Skill";

    string public constant SBT_SYMBOL =
        "DTS";

    uint256 public nextTokenId = 1;

    mapping(uint256 => address)
        private sbtOwner;

    mapping(address => uint256)
        private sbtBalance;

    mapping(uint256 => uint256)
        public tokenPR;

    mapping(uint256 => address)
        public tokenDeveloper;

    mapping(address => uint256[])
        private developerTokens;


    // ============================================================
    //                REGISTER A PULL REQUEST
    // ============================================================

    /**
     * Developer registers a GitHub PR.
     *
     * msg.value consists of:
     *
     * developer stake
     * +
     * reviewer reward pool
     *
     * Example:
     *
     * Developer stake = 0.01 ETH
     * Reward pool     = 0.02 ETH
     * Total sent      = 0.03 ETH
     */
    function registerPR(
        string calldata repository,
        uint256 prNumber,
        string calldata prUrl,
        address company,
        uint256 reviewerRewardPool
    )
        external
        payable
        returns (uint256)
    {
        require(
            bytes(repository).length > 0,
            "Repository required"
        );

        require(
            bytes(prUrl).length > 0,
            "PR URL required"
        );

        require(
            prNumber > 0,
            "Invalid PR number"
        );

        require(
            company != address(0),
            "Invalid company"
        );

        require(
            msg.value >=
                MIN_DEVELOPER_STAKE +
                reviewerRewardPool,
            "Insufficient ETH"
        );

        uint256 developerStake =
            msg.value -
            reviewerRewardPool;

        require(
            developerStake >=
                MIN_DEVELOPER_STAKE,
            "Developer stake too small"
        );

        uint256 prId =
            nextPRId++;

        pullRequests[prId] = PullRequest({
            id: prId,
            repository: repository,
            prNumber: prNumber,
            prUrl: prUrl,
            developer: msg.sender,
            developerStake: developerStake,
            reviewerRewardPool: reviewerRewardPool,
            totalReviewerStake: 0,
            reviewerCount: 0,
            status: PRStatus.OPEN,
            company: company,
            createdAt: block.timestamp,
            mergedAt: 0,
            challengeDeadline: 0,
            mergeCommit: "",
            settled: false
        });

        emit PRRegistered(
            prId,
            repository,
            prNumber,
            msg.sender,
            developerStake,
            reviewerRewardPool
        );

        emit DeveloperStakeDeposited(
            prId,
            msg.sender,
            developerStake
        );

        return prId;
    }


    // ============================================================
    //                  REVIEWER STAKING
    // ============================================================

    /**
     * Reviewer stakes ETH and votes on the PR.
     *
     * true  = reviewer believes contribution deserves approval
     * false = reviewer believes contribution should be rejected
     */
    function stakeOnPR(
        uint256 prId,
        bool approveVote
    )
        external
        payable
    {
        PullRequest storage pr =
            pullRequests[prId];

        require(
            pr.status == PRStatus.OPEN,
            "PR not open for review"
        );

        require(
            msg.sender != pr.developer,
            "Developer cannot review own PR"
        );

        require(
            msg.value >= MIN_REVIEWER_STAKE,
            "Reviewer stake too small"
        );

        require(
            pr.reviewerCount < MAX_REVIEWERS,
            "Reviewer limit reached"
        );

        require(
            !reviews[prId][msg.sender].exists,
            "Already reviewed"
        );

        reviews[prId][msg.sender] = Review({
            reviewer: msg.sender,
            stake: msg.value,
            approveVote: approveVote,
            settled: false,
            exists: true
        });

        reviewerList[prId].push(
            msg.sender
        );

        pr.reviewerCount += 1;
        pr.totalReviewerStake += msg.value;

        emit ReviewerStaked(
            prId,
            msg.sender,
            msg.value,
            approveVote
        );
    }


    // ============================================================
    //                  REVIEWER INFORMATION
    // ============================================================

    function getReview(
        uint256 prId,
        address reviewer
    )
        external
        view
        returns (
            address,
            uint256,
            bool,
            bool,
            bool
        )
    {
        Review storage review =
            reviews[prId][reviewer];

        return (
            review.reviewer,
            review.stake,
            review.approveVote,
            review.settled,
            review.exists
        );
    }

    function getReviewerCount(
        uint256 prId
    )
        external
        view
        returns (uint256)
    {
        return reviewerList[prId].length;
    }

    function getReviewerAt(
        uint256 prId,
        uint256 index
    )
        external
        view
        returns (address)
    {
        require(
            index < reviewerList[prId].length,
            "Invalid reviewer index"
        );

        return reviewerList[prId][index];
    }


    // ============================================================
    //              GITHUB ORACLE: MERGE VERIFICATION
    // ============================================================

    /**
     * Backend/oracle confirms that GitHub merged the PR.
     *
     * The oracle only verifies the GitHub fact.
     *
     * It does NOT make the final company decision.
     */
    function verifyPRMerged(
        uint256 prId,
        string calldata mergeCommit
    )
        external
        onlyOracle
    {
        PullRequest storage pr =
            pullRequests[prId];

        require(
            pr.status == PRStatus.OPEN,
            "Invalid PR status"
        );

        require(
            bytes(mergeCommit).length > 0,
            "Merge commit required"
        );

        pr.status =
            PRStatus.MERGED;

        pr.mergedAt =
            block.timestamp;

        pr.challengeDeadline =
            block.timestamp +
            challengePeriod;

        pr.mergeCommit =
            mergeCommit;

        emit PRMergeVerified(
            prId,
            mergeCommit,
            block.timestamp
        );
    }


    // ============================================================
    //                 COMPANY FINAL DECISION
    // ============================================================

    /**
     * Company approves a merged PR.
     */
    function approvePR(
        uint256 prId
    )
        external
    {
        PullRequest storage pr =
            pullRequests[prId];

        require(
            msg.sender == pr.company,
            "Only company can approve"
        );

        require(
            pr.status == PRStatus.MERGED,
            "PR not ready"
        );

        require(
            block.timestamp >=
                pr.challengeDeadline,
            "Challenge period active"
        );

        pr.status =
            PRStatus.APPROVED;

        emit PRApproved(
            prId,
            msg.sender
        );
    }


    /**
     * Company rejects a merged PR.
     */
    function rejectPR(
        uint256 prId
    )
        external
    {
        PullRequest storage pr =
            pullRequests[prId];

        require(
            msg.sender == pr.company,
            "Only company can reject"
        );

        require(
            pr.status == PRStatus.MERGED,
            "PR not ready"
        );

        require(
            block.timestamp >=
                pr.challengeDeadline,
            "Challenge period active"
        );

        pr.status =
            PRStatus.REJECTED;

        emit PRRejected(
            prId,
            msg.sender
        );
    }


    // ============================================================
    //                         SETTLEMENT
    // ============================================================

    /**
     * Final settlement entry point.
     *
     * The large settlement logic is intentionally split into
     * smaller internal functions to avoid Solidity stack-depth
     * problems.
     */
    function settlePR(
        uint256 prId
    )
        external
    {
        PullRequest storage pr =
            pullRequests[prId];

        require(
            pr.status == PRStatus.APPROVED ||
            pr.status == PRStatus.REJECTED,
            "PR not finalized"
        );

        require(
            !pr.settled,
            "Already settled"
        );

        bool approved =
            pr.status == PRStatus.APPROVED;

        uint256 reviewerCount =
            reviewerList[prId].length;

        uint256 totalReviewerStake =
            pr.totalReviewerStake;

        pr.settled = true;

        if (approved) {
            _settleApprovedPR(prId);
        } else {
            _settleRejectedPR(prId);
        }

        pr.status =
            PRStatus.SETTLED;

        emit PRSettled(
            prId,
            approved,
            reviewerCount,
            totalReviewerStake
        );
    }


    // ============================================================
    //                 APPROVED PR SETTLEMENT
    // ============================================================

    function _settleApprovedPR(
        uint256 prId
    )
        internal
    {
        PullRequest storage pr =
            pullRequests[prId];

        address developer =
            pr.developer;

        // Return developer's stake.
        _returnDeveloperStake(
            prId
        );

        // Count reviewers who voted approve.
        uint256 approvingReviewers =
            _countApprovingReviewers(
                prId
            );

        uint256 rewardPerReviewer = 0;

        if (
            approvingReviewers > 0 &&
            pr.reviewerRewardPool > 0
        ) {
            rewardPerReviewer =
                pr.reviewerRewardPool /
                approvingReviewers;
        }

        // Settle reviewers.
        _settleApprovedReviewers(
            prId,
            rewardPerReviewer
        );

        // Reward pool is consumed.
        pr.reviewerRewardPool = 0;

        // Increase reputation.
        reputation[developer] +=
            REPUTATION_PER_SUCCESS;

        emit DeveloperReputationUpdated(
            developer,
            reputation[developer]
        );

        // Mint Proof-of-Skill SBT.
        _mintSkillSBT(
            developer,
            prId
        );
    }


    // ============================================================
    //                REJECTED PR SETTLEMENT
    // ============================================================

    function _settleRejectedPR(
        uint256 prId
    )
        internal
    {
        PullRequest storage pr =
            pullRequests[prId];

        // Return developer stake.
        _returnDeveloperStake(
            prId
        );

        // Slash every reviewer.
        address[] storage reviewers =
            reviewerList[prId];

        for (
            uint256 i = 0;
            i < reviewers.length;
            i++
        ) {
            address reviewer =
                reviewers[i];

            Review storage review =
                reviews[prId][reviewer];

            if (review.settled) {
                continue;
            }

            review.settled = true;

            _slashReviewer(
                prId,
                reviewer,
                review
            );
        }

        // No reward is paid after rejection.
        pr.reviewerRewardPool = 0;
    }


    // ============================================================
    //              COUNT APPROVING REVIEWERS
    // ============================================================

    function _countApprovingReviewers(
        uint256 prId
    )
        internal
        view
        returns (uint256 count)
    {
        address[] storage reviewers =
            reviewerList[prId];

        for (
            uint256 i = 0;
            i < reviewers.length;
            i++
        ) {
            if (
                reviews[prId][reviewers[i]]
                    .approveVote
            ) {
                count++;
            }
        }
    }


    // ============================================================
    //              SETTLE APPROVED REVIEWERS
    // ============================================================

    function _settleApprovedReviewers(
        uint256 prId,
        uint256 rewardPerReviewer
    )
        internal
    {
        address[] storage reviewers =
            reviewerList[prId];

        for (
            uint256 i = 0;
            i < reviewers.length;
            i++
        ) {
            address reviewer =
                reviewers[i];

            Review storage review =
                reviews[prId][reviewer];

            if (review.settled) {
                continue;
            }

            review.settled = true;

            if (review.approveVote) {

                _returnReviewerStakeAndReward(
                    prId,
                    reviewer,
                    review,
                    rewardPerReviewer
                );

            } else {

                _slashReviewer(
                    prId,
                    reviewer,
                    review
                );
            }
        }
    }


    // ============================================================
    //              RETURN DEVELOPER STAKE
    // ============================================================

    function _returnDeveloperStake(
        uint256 prId
    )
        internal
    {
        PullRequest storage pr =
            pullRequests[prId];

        uint256 amount =
            pr.developerStake;

        if (amount == 0) {
            return;
        }

        address developer =
            pr.developer;

        pr.developerStake = 0;

        (bool paid,) =
            payable(developer).call{
                value: amount
            }("");

        require(
            paid,
            "Developer payment failed"
        );

        emit DeveloperStakeReturned(
            prId,
            developer,
            amount
        );
    }


    // ============================================================
    //            RETURN REVIEWER STAKE + REWARD
    // ============================================================

    function _returnReviewerStakeAndReward(
        uint256 prId,
        address reviewer,
        Review storage review,
        uint256 reward
    )
        internal
    {
        uint256 stakeAmount =
            review.stake;

        review.stake = 0;

        uint256 total =
            stakeAmount +
            reward;

        (bool paid,) =
            payable(reviewer).call{
                value: total
            }("");

        require(
            paid,
            "Reviewer payment failed"
        );

        emit ReviewerRewarded(
            prId,
            reviewer,
            stakeAmount,
            reward
        );
    }


    // ============================================================
    //                    SLASH REVIEWER
    // ============================================================

    function _slashReviewer(
        uint256 prId,
        address reviewer,
        Review storage review
    )
        internal
    {
        uint256 amount =
            review.stake;

        review.stake = 0;

        if (amount == 0) {
            return;
        }

        (bool paid,) =
            payable(treasury).call{
                value: amount
            }("");

        require(
            paid,
            "Slash transfer failed"
        );

        emit ReviewerSlashed(
            prId,
            reviewer,
            amount
        );
    }


    // ============================================================
    //                    SBT IMPLEMENTATION
    // ============================================================

    /**
     * Mint a non-transferable Proof-of-Skill token.
     *
     * Only internal settlement logic can call this.
     */
    function _mintSkillSBT(
        address developer,
        uint256 prId
    )
        internal
    {
        uint256 tokenId =
            nextTokenId++;

        sbtOwner[tokenId] =
            developer;

        sbtBalance[developer] += 1;

        tokenPR[tokenId] =
            prId;

        tokenDeveloper[tokenId] =
            developer;

        developerTokens[developer].push(
            tokenId
        );

        emit Transfer(
            address(0),
            developer,
            tokenId
        );

        emit SkillSBTMinted(
            tokenId,
            developer,
            prId
        );
    }


    // ============================================================
    //                       SBT GETTERS
    // ============================================================

    function ownerOf(
        uint256 tokenId
    )
        external
        view
        returns (address)
    {
        address tokenOwner =
            sbtOwner[tokenId];

        require(
            tokenOwner != address(0),
            "SBT does not exist"
        );

        return tokenOwner;
    }

    function balanceOf(
        address account
    )
        external
        view
        returns (uint256)
    {
        require(
            account != address(0),
            "Invalid address"
        );

        return sbtBalance[account];
    }

    function getDeveloperTokens(
        address developer
    )
        external
        view
        returns (uint256[] memory)
    {
        return developerTokens[developer];
    }

    function getSBTInfo(
        uint256 tokenId
    )
        external
        view
        returns (
            address developer,
            uint256 prId,
            string memory repository,
            uint256 prNumber
        )
    {
        developer =
            tokenDeveloper[tokenId];

        require(
            developer != address(0),
            "SBT does not exist"
        );

        prId =
            tokenPR[tokenId];

        PullRequest storage pr =
            pullRequests[prId];

        repository =
            pr.repository;

        prNumber =
            pr.prNumber;
    }


    // ============================================================
    //                  PR VIEW FUNCTIONS
    // ============================================================

    /**
     * Basic PR information.
     *
     * Split into smaller getters rather than returning a huge
     * 16-value tuple from one function.
     */
    function getPRBasic(
        uint256 prId
    )
        external
        view
        returns (
            uint256 id,
            string memory repository,
            uint256 prNumber,
            string memory prUrl,
            address developer,
            address company
        )
    {
        PullRequest storage pr =
            pullRequests[prId];

        return (
            pr.id,
            pr.repository,
            pr.prNumber,
            pr.prUrl,
            pr.developer,
            pr.company
        );
    }


    /**
     * PR staking information.
     */
    function getPRStaking(
        uint256 prId
    )
        external
        view
        returns (
            uint256 developerStake,
            uint256 reviewerRewardPool,
            uint256 totalReviewerStake,
            uint256 reviewerCount
        )
    {
        PullRequest storage pr =
            pullRequests[prId];

        return (
            pr.developerStake,
            pr.reviewerRewardPool,
            pr.totalReviewerStake,
            pr.reviewerCount
        );
    }


    /**
     * PR lifecycle/status information.
     */
    function getPRStatus(
        uint256 prId
    )
        external
        view
        returns (
            PRStatus status,
            uint256 createdAt,
            uint256 mergedAt,
            uint256 challengeDeadline,
            bool settled
        )
    {
        PullRequest storage pr =
            pullRequests[prId];

        return (
            pr.status,
            pr.createdAt,
            pr.mergedAt,
            pr.challengeDeadline,
            pr.settled
        );
    }


    /**
     * GitHub merge information.
     */
    function getPRMergeInfo(
        uint256 prId
    )
        external
        view
        returns (
            string memory repository,
            uint256 prNumber,
            string memory prUrl,
            string memory mergeCommit
        )
    {
        PullRequest storage pr =
            pullRequests[prId];

        return (
            pr.repository,
            pr.prNumber,
            pr.prUrl,
            pr.mergeCommit
        );
    }


    /**
     * Convenience getter for developer/company.
     */
    function getPRParticipants(
        uint256 prId
    )
        external
        view
        returns (
            address developer,
            address company
        )
    {
        PullRequest storage pr =
            pullRequests[prId];

        return (
            pr.developer,
            pr.company
        );
    }


    // ============================================================
    //                     ADMIN FUNCTIONS
    // ============================================================

    function setOracle(
        address newOracle
    )
        external
        onlyOwner
    {
        require(
            newOracle != address(0),
            "Invalid oracle"
        );

        oracle =
            newOracle;

        emit OracleUpdated(
            newOracle
        );
    }


    function setTreasury(
        address newTreasury
    )
        external
        onlyOwner
    {
        require(
            newTreasury != address(0),
            "Invalid treasury"
        );

        treasury =
            newTreasury;

        emit TreasuryUpdated(
            newTreasury
        );
    }


    /**
     * Change challenge period.
     *
     * Only affects PRs registered after the change.
     */
    function setChallengePeriod(
        uint256 newPeriod
    )
        external
        onlyOwner
    {
        require(
            newPeriod <= 30 days,
            "Period too long"
        );

        challengePeriod =
            newPeriod;
    }


    // ============================================================
    //                  EMERGENCY WITHDRAW
    // ============================================================

    /**
     * Emergency owner withdrawal.
     *
     * Do NOT use this during a live PR settlement.
     *
     * In a production contract this should be replaced with
     * accounting that prevents withdrawal of funds belonging
     * to active PRs.
     */
    function emergencyWithdraw(
        uint256 amount
    )
        external
        onlyOwner
    {
        require(
            amount <= address(this).balance,
            "Insufficient balance"
        );

        (bool ok,) =
            payable(owner).call{
                value: amount
            }("");

        require(
            ok,
            "Withdrawal failed"
        );
    }


    // ============================================================
    //              LEGACY REWARD / SLASH FUNCTIONS
    // ============================================================

    /**
     * Legacy compatibility function.
     *
     * New PR workflow should use settlePR().
     */
    function slash(
        address developer
    )
        external
        onlyOwnerOrOracle
    {
        uint256 amount =
            stakes[developer];

        require(
            amount > 0,
            "No stake"
        );

        stakes[developer] = 0;

        (bool ok,) =
            payable(treasury).call{
                value: amount
            }("");

        require(
            ok,
            "Transfer failed"
        );

        emit Slashed(
            developer,
            amount
        );
    }


    /**
     * Legacy direct reward function.
     *
     * New PR workflow should use settlePR().
     */
    function reward(
        address developer
    )
        external
        payable
        onlyOwnerOrOracle
    {
        require(
            developer != address(0),
            "Invalid developer"
        );

        require(
            msg.value > 0,
            "Reward must be greater than 0"
        );

        (bool ok,) =
            payable(developer).call{
                value: msg.value
            }("");

        require(
            ok,
            "Reward transfer failed"
        );

        emit Rewarded(
            developer,
            msg.value
        );
    }


    // ============================================================
    //                     RECEIVE ETH
    // ============================================================

    /**
     * Allows the contract to receive ETH directly.
     *
     * PR staking should use:
     *
     * registerPR()
     * stakeOnPR()
     */
    receive()
        external
        payable
    {}
}
