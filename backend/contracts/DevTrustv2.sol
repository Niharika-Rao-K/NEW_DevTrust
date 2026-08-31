// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DevTrust
 * @notice Decentralized Peer-Staking / Proof-of-Skill protocol.
 *
 * Core workflow:
 *
 * Developer
 *     |
 *     | register PR + stake
 *     v
 * GitHub PR
 *     |
 *     | reviewers stake behind their evaluation
 *     v
 * Peer Review
 *     |
 *     | GitHub PR merged
 *     v
 * Oracle
 *     |
 *     | challenge period
 *     v
 * Success / Failure
 *     |
 *     +--------------------+
 *     |                    |
 *   SUCCESS              FAILURE
 *     |                    |
 * reviewer stake         reviewer
 * returned + reward      stakes slashed
 *     |                    |
 * developer reputation   no SBT
 * increased
 *     |
 * SBT minted
 *
 * This is an MVP / academic PoC.
 * The Oracle is centralized for the PoC and can later be replaced
 * by Chainlink Functions / decentralized oracle infrastructure.
 */
contract DevTrust is ERC721, ReentrancyGuard {

    // =============================================================
    //                       ADMIN
    // =============================================================

    string public trustName;
    uint256 public creationTime;

    address public owner;
    address public oracle;

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

    // =============================================================
    //                       CONSTANTS
    // =============================================================

    /**
     * Minimum amount a developer must stake for a PR.
     */
    uint256 public constant MIN_DEVELOPER_STAKE = 0.001 ether;

    /**
     * Minimum amount a reviewer must stake.
     */
    uint256 public constant MIN_REVIEWER_STAKE = 0.001 ether;

    /**
     * Percentage of reviewer stake paid as accuracy reward
     * when the review is correct.
     *
     * Example:
     * reviewer stakes 0.01 ETH
     * reward = 10% = 0.001 ETH
     *
     * The reward is paid from the protocol reward pool,
     * not from the reviewer's own stake.
     */
    uint256 public constant REVIEWER_REWARD_PERCENT = 10;

    /**
     * Challenge period after GitHub confirms the PR was merged.
     *
     * Production:
     *     7 days
     *
     * For your demo you can temporarily change this to a smaller
     * value, but the final academic version should use 7 days.
     */
    uint256 public constant CHALLENGE_PERIOD = 7 days;

    // =============================================================
    //                       PR STATUS
    // =============================================================

    enum PRStatus {
        NONE,
        OPEN,
        MERGED,
        SUCCESS,
        FAILED
    }

    enum ReviewDecision {
        NONE,
        APPROVE,
        REJECT
    }

    // =============================================================
    //                       REVIEW
    // =============================================================

    struct Review {
        address reviewer;
        uint256 stake;
        ReviewDecision decision;
        bool settled;
    }

    // =============================================================
    //                       PULL REQUEST
    // =============================================================

    struct PullRequest {
        uint256 id;

        /**
         * GitHub PR number.
         */
        uint256 githubPRNumber;

        /**
         * Example:
         * "owner/repository"
         */
        string repository;

        /**
         * Full GitHub PR URL.
         */
        string prUrl;

        /**
         * Developer wallet.
         */
        address developer;

        /**
         * ETH locked by developer.
         */
        uint256 developerStake;

        /**
         * Time at which PR was registered.
         */
        uint256 createdAt;

        /**
         * Time at which GitHub merge was confirmed.
         */
        uint256 mergedAt;

        /**
         * Current state.
         */
        PRStatus status;

        /**
         * Whether settlement has occurred.
         */
        bool settled;

        /**
         * Number of reviews.
         */
        uint256 reviewCount;
    }

    // =============================================================
    //                       STORAGE
    // =============================================================

    /**
     * PR ID => PullRequest
     */
    mapping(uint256 => PullRequest) public pullRequests;

    /**
     * PR ID => reviewer => Review
     */
    mapping(uint256 => mapping(address => Review)) public reviews;

    /**
     * PR ID => reviewer addresses
     *
     * Used for settlement.
     */
    mapping(uint256 => address[]) private _reviewers;

    /**
     * GitHub PR identifier => DevTrust PR ID
     *
     * We use a hash of repository + PR number.
     */
    mapping(bytes32 => uint256) public githubPRToDevTrustPR;

    /**
     * Developer => reputation score.
     */
    mapping(address => uint256) public reputation;

    /**
     * Developer => number of successful PRs.
     */
    mapping(address => uint256) public successfulPRs;

    /**
     * Developer => number of failed PRs.
     */
    mapping(address => uint256) public failedPRs;

    /**
     * Reviewer => number of successful reviews.
     */
    mapping(address => uint256) public successfulReviews;

    /**
     * Reviewer => number of failed reviews.
     */
    mapping(address => uint256) public failedReviews;

    /**
     * Existing generic staking system.
     *
     * Kept for compatibility with your current frontend/backend.
     */
    mapping(address => uint256) public stakes;

    /**
     * Generic records / reputation records.
     */
    struct TrustRecord {
        address user;
        string data;
        uint256 timestamp;
    }

    TrustRecord[] public records;

    /**
     * ETH available to pay reviewer rewards.
     */
    uint256 public rewardPool;

    /**
     * Auto-incrementing DevTrust PR ID.
     */
    uint256 public nextPRId = 1;

    /**
     * SBT token ID.
     */
    uint256 public nextTokenId = 1;

    /**
     * Token ID => PR ID.
     */
    mapping(uint256 => uint256) public tokenToPR;

    /**
     * Developer => successful PR => token ID
     */
    mapping(address => uint256[]) private _developerBadges;

    // =============================================================
    //                       EVENTS
    // =============================================================

    event OracleUpdated(address indexed newOracle);

    event Staked(
        address indexed user,
        uint256 amount
    );

    event StakeWithdrawn(
        address indexed user,
        uint256 amount
    );

    event RecordAdded(
        address indexed user,
        string data,
        uint256 timestamp
    );

    event Slashed(
        address indexed developer,
        uint256 amount
    );

    event Rewarded(
        address indexed developer,
        uint256 amount
    );

    event RewardPoolFunded(
        address indexed funder,
        uint256 amount
    );

    event PRRegistered(
        uint256 indexed prId,
        address indexed developer,
        uint256 githubPRNumber,
        string repository,
        string prUrl,
        uint256 developerStake
    );

    event ReviewerStaked(
        uint256 indexed prId,
        address indexed reviewer,
        uint256 amount,
        ReviewDecision decision
    );

    event PRMerged(
        uint256 indexed prId,
        uint256 mergedAt,
        uint256 challengeEndsAt
    );

    event PRSuccessful(
        uint256 indexed prId,
        address indexed developer
    );

    event PRFailed(
        uint256 indexed prId,
        address indexed developer
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

    event DeveloperStakeSlashed(
        uint256 indexed prId,
        address indexed developer,
        uint256 amount
    );

    event SkillBadgeMinted(
        uint256 indexed prId,
        address indexed developer,
        uint256 indexed tokenId
    );

    // =============================================================
    //                       CONSTRUCTOR
    // =============================================================

    constructor(
        string memory _trustName
    )
        ERC721("DevTrust Proof of Skill", "DTSBT")
    {
        trustName = _trustName;
        creationTime = block.timestamp;

        owner = msg.sender;

        /**
         * For the PoC, deployer is initially the Oracle.
         *
         * Your Render backend wallet can later be assigned:
         *
         * setOracle(BACKEND_ORACLE_ADDRESS)
         */
        oracle = msg.sender;
    }

    // =============================================================
    //                       ADMIN
    // =============================================================

    /**
     * @notice Change the GitHub Oracle.
     */
    function setOracle(
        address _oracle
    )
        external
        onlyOwner
    {
        require(
            _oracle != address(0),
            "Invalid oracle"
        );

        oracle = _oracle;

        emit OracleUpdated(_oracle);
    }

    /**
     * @notice Transfer contract ownership.
     *
     * Simple ownership implementation for your PoC.
     */
    function transferOwnership(
        address newOwner
    )
        external
        onlyOwner
    {
        require(
            newOwner != address(0),
            "Invalid owner"
        );

        owner = newOwner;
    }

    // =============================================================
    //                 GENERIC STAKING - EXISTING
    // =============================================================

    /**
     * @notice Generic staking function retained from your
     *         previous DevTrust contract.
     *
     * This is NOT the same as reviewer staking on a PR.
     */
    function stake()
        external
        payable
    {
        require(
            msg.value >= MIN_REVIEWER_STAKE,
            "Stake too small"
        );

        stakes[msg.sender] += msg.value;

        emit Staked(
            msg.sender,
            msg.value
        );
    }

    /**
     * @notice Withdraw generic stake.
     */
    function withdrawStake(
        uint256 amount
    )
        external
        nonReentrant
    {
        require(
            amount > 0,
            "Invalid amount"
        );

        require(
            stakes[msg.sender] >= amount,
            "Insufficient stake"
        );

        stakes[msg.sender] -= amount;

        (bool success, ) = payable(msg.sender).call{
            value: amount
        }("");

        require(
            success,
            "Transfer failed"
        );

        emit StakeWithdrawn(
            msg.sender,
            amount
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

    // =============================================================
    //                 PR REGISTRATION
    // =============================================================

    /**
     * @notice Developer registers a GitHub PR and locks a stake.
     *
     * Example:
     *
     * repository = "myorg/myrepo"
     * githubPRNumber = 25
     * prUrl = "https://github.com/myorg/myrepo/pull/25"
     *
     * The developer's wallet becomes the owner of the contribution
     * record.
     */
    function registerPR(
        uint256 githubPRNumber,
        string calldata repository,
        string calldata prUrl
    )
        external
        payable
        returns (uint256 prId)
    {
        require(
            msg.value >= MIN_DEVELOPER_STAKE,
            "Developer stake too small"
        );

        require(
            githubPRNumber > 0,
            "Invalid PR number"
        );

        require(
            bytes(repository).length > 0,
            "Repository required"
        );

        require(
            bytes(prUrl).length > 0,
            "PR URL required"
        );

        bytes32 githubKey = keccak256(
            abi.encodePacked(
                repository,
                "#",
                githubPRNumber
            )
        );

        require(
            githubPRToDevTrustPR[githubKey] == 0,
            "PR already registered"
        );

        prId = nextPRId++;

        pullRequests[prId] = PullRequest({
            id: prId,
            githubPRNumber: githubPRNumber,
            repository: repository,
            prUrl: prUrl,
            developer: msg.sender,
            developerStake: msg.value,
            createdAt: block.timestamp,
            mergedAt: 0,
            status: PRStatus.OPEN,
            settled: false,
            reviewCount: 0
        });

        githubPRToDevTrustPR[githubKey] = prId;

        emit PRRegistered(
            prId,
            msg.sender,
            githubPRNumber,
            repository,
            prUrl,
            msg.value
        );
    }

    // =============================================================
    //                 REVIEWER STAKING
    // =============================================================

    /**
     * @notice Reviewer stakes ETH behind their evaluation.
     *
     * APPROVE:
     *     "I believe this contribution is high quality."
     *
     * REJECT:
     *     "I believe this contribution should not be trusted."
     *
     * If the contribution succeeds:
     *     APPROVE reviewers win.
     *
     * If the contribution fails:
     *     APPROVE reviewers lose their stake.
     *
     * REJECT reviewers are treated as having correctly identified
     * a bad contribution.
     */
    function submitReview(
        uint256 prId,
        ReviewDecision decision
    )
        external
        payable
    {
        require(
            prId > 0 && prId < nextPRId,
            "Invalid PR"
        );

        PullRequest storage pr = pullRequests[prId];

        require(
            pr.status == PRStatus.OPEN,
            "PR not accepting reviews"
        );

        require(
            msg.sender != pr.developer,
            "Developer cannot review own PR"
        );

        require(
            decision == ReviewDecision.APPROVE ||
            decision == ReviewDecision.REJECT,
            "Invalid decision"
        );

        require(
            msg.value >= MIN_REVIEWER_STAKE,
            "Reviewer stake too small"
        );

        require(
            reviews[prId][msg.sender].reviewer == address(0),
            "Already reviewed"
        );

        reviews[prId][msg.sender] = Review({
            reviewer: msg.sender,
            stake: msg.value,
            decision: decision,
            settled: false
        });

        _reviewers[prId].push(msg.sender);

        pr.reviewCount++;

        emit ReviewerStaked(
            prId,
            msg.sender,
            msg.value,
            decision
        );
    }

    // =============================================================
    //                 GITHUB ORACLE
    // =============================================================

    /**
     * @notice Oracle confirms that GitHub merged the PR.
     *
     * This does NOT immediately distribute rewards.
     *
     * Instead it starts the challenge period.
     */
    function confirmPRMerged(
        uint256 prId
    )
        external
        onlyOracle
    {
        PullRequest storage pr = pullRequests[prId];

        require(
            pr.status == PRStatus.OPEN,
            "PR not open"
        );

        pr.status = PRStatus.MERGED;
        pr.mergedAt = block.timestamp;

        emit PRMerged(
            prId,
            block.timestamp,
            block.timestamp + CHALLENGE_PERIOD
        );
    }

    /**
     * @notice Oracle confirms that the merged contribution failed.
     *
     * For example:
     *
     * - severe bug
     * - revert
     * - regression
     * - verified failure
     *
     * This immediately moves the PR to FAILED.
     */
    function reportPRFailure(
        uint256 prId
    )
        external
        onlyOracle
    {
        PullRequest storage pr = pullRequests[prId];

        require(
            pr.status == PRStatus.MERGED,
            "PR is not merged"
        );

        require(
            !pr.settled,
            "Already settled"
        );

        _settleFailure(prId);
    }

    /**
     * @notice Oracle confirms that the PR survived the challenge
     *         period successfully.
     *
     * The Oracle should only call this after:
     *
     * mergedAt + 7 days <= block.timestamp
     */
    function confirmPRSuccess(
        uint256 prId
    )
        external
        onlyOracle
        nonReentrant
    {
        PullRequest storage pr = pullRequests[prId];

        require(
            pr.status == PRStatus.MERGED,
            "PR not merged"
        );

        require(
            !pr.settled,
            "Already settled"
        );

        require(
            block.timestamp >=
            pr.mergedAt + CHALLENGE_PERIOD,
            "Challenge period active"
        );

        _settleSuccess(prId);
    }

    // =============================================================
    //                 SUCCESS SETTLEMENT
    // =============================================================

    function _settleSuccess(
        uint256 prId
    )
        internal
    {
        PullRequest storage pr = pullRequests[prId];

        pr.status = PRStatus.SUCCESS;
        pr.settled = true;

        successfulPRs[pr.developer]++;

        /**
         * Increase developer reputation.
         *
         * For MVP:
         *     +100 per successful contribution.
         */
        reputation[pr.developer] += 100;

        // ---------------------------------------------------------
        // Return developer stake
        // ---------------------------------------------------------

        uint256 developerStake = pr.developerStake;

        pr.developerStake = 0;

        if (developerStake > 0) {
            (bool developerPaid, ) =
                payable(pr.developer).call{
                    value: developerStake
                }("");

            require(
                developerPaid,
                "Developer payment failed"
            );

            emit DeveloperStakeReturned(
                prId,
                pr.developer,
                developerStake
            );
        }

        // ---------------------------------------------------------
        // Settle reviewers
        // ---------------------------------------------------------

        address[] memory reviewerList = _reviewers[prId];

        for (
            uint256 i = 0;
            i < reviewerList.length;
            i++
        ) {
            address reviewer = reviewerList[i];

            Review storage review =
                reviews[prId][reviewer];

            if (review.settled) {
                continue;
            }

            review.settled = true;

            if (
                review.decision ==
                ReviewDecision.APPROVE
            ) {
                /**
                 * Correct reviewer.
                 *
                 * Return original stake.
                 */
                uint256 stakeAmount =
                    review.stake;

                /**
                 * Accuracy reward.
                 */
                uint256 rewardAmount =
                    (stakeAmount *
                        REVIEWER_REWARD_PERCENT) /
                    100;

                review.stake = 0;

                uint256 availableReward =
                    rewardPool;

                if (
                    rewardAmount >
                    availableReward
                ) {
                    rewardAmount =
                        availableReward;
                }

                rewardPool -= rewardAmount;

                uint256 totalPayment =
                    stakeAmount +
                    rewardAmount;

                (bool paid, ) =
                    payable(reviewer).call{
                        value: totalPayment
                    }("");

                require(
                    paid,
                    "Reviewer payment failed"
                );

                successfulReviews[reviewer]++;

                emit ReviewerRewarded(
                    prId,
                    reviewer,
                    stakeAmount,
                    rewardAmount
                );
            }
            else {
                /**
                 * A REJECT reviewer was incorrect because
                 * the contribution ultimately succeeded.
                 *
                 * Their stake is returned.
                 *
                 * We don't give them the accuracy reward.
                 */
                uint256 stakeAmount =
                    review.stake;

                review.stake = 0;

                (bool paid, ) =
                    payable(reviewer).call{
                        value: stakeAmount
                    }("");

                require(
                    paid,
                    "Reviewer refund failed"
                );
            }
        }

        // ---------------------------------------------------------
        // Mint Proof-of-Skill SBT
        // ---------------------------------------------------------

        uint256 tokenId =
            _mintSkillBadge(
                pr.developer,
                prId
            );

        tokenToPR[tokenId] = prId;

        emit PRSuccessful(
            prId,
            pr.developer
        );

        emit SkillBadgeMinted(
            prId,
            pr.developer,
            tokenId
        );
    }

    // =============================================================
    //                 FAILURE SETTLEMENT
    // =============================================================

    function _settleFailure(
        uint256 prId
    )
        internal
    {
        PullRequest storage pr = pullRequests[prId];

        pr.status = PRStatus.FAILED;
        pr.settled = true;

        failedPRs[pr.developer]++;

        /**
         * Developer loses reputation.
         */
        if (reputation[pr.developer] >= 50) {
            reputation[pr.developer] -= 50;
        }
        else {
            reputation[pr.developer] = 0;
        }

        // ---------------------------------------------------------
        // Slash developer stake
        // ---------------------------------------------------------

        uint256 developerStake =
            pr.developerStake;

        pr.developerStake = 0;

        if (developerStake > 0) {

            /**
             * Slashed ETH goes into the protocol reward pool.
             *
             * This gives the treasury/reward mechanism a source
             * of funds.
             */
            rewardPool += developerStake;

            emit DeveloperStakeSlashed(
                prId,
                pr.developer,
                developerStake
            );

            emit Slashed(
                pr.developer,
                developerStake
            );
        }

        // ---------------------------------------------------------
        // Settle reviewers
        // ---------------------------------------------------------

        address[] memory reviewerList =
            _reviewers[prId];

        for (
            uint256 i = 0;
            i < reviewerList.length;
            i++
        ) {
            address reviewer =
                reviewerList[i];

            Review storage review =
                reviews[prId][reviewer];

            if (review.settled) {
                continue;
            }

            review.settled = true;

            if (
                review.decision ==
                ReviewDecision.APPROVE
            ) {
                /**
                 * APPROVE was incorrect.
                 *
                 * Reviewer loses their stake.
                 */
                uint256 amount =
                    review.stake;

                review.stake = 0;

                rewardPool += amount;

                failedReviews[reviewer]++;

                emit ReviewerSlashed(
                    prId,
                    reviewer,
                    amount
                );
            }
            else {
                /**
                 * REJECT was correct.
                 *
                 * Return their stake.
                 */
                uint256 amount =
                    review.stake;

                review.stake = 0;

                (bool paid, ) =
                    payable(reviewer).call{
                        value: amount
                    }("");

                require(
                    paid,
                    "Reviewer refund failed"
                );

                successfulReviews[reviewer]++;
            }
        }

        emit PRFailed(
            prId,
            pr.developer
        );
    }

    // =============================================================
    //                 SBT / PROOF OF SKILL
    // =============================================================

    /**
     * @notice Mint a non-transferable Proof-of-Skill badge.
     *
     * This is deliberately restricted to the contract itself.
     */
    function _mintSkillBadge(
        address developer,
        uint256 prId
    )
        internal
        returns (uint256 tokenId)
    {
        tokenId = nextTokenId++;

        _safeMint(
            developer,
            tokenId
        );

        _developerBadges[
            developer
        ].push(tokenId);
    }

    /**
     * @notice Returns all SBTs earned by a developer.
     */
    function getDeveloperBadges(
        address developer
    )
        external
        view
        returns (uint256[] memory)
    {
        return _developerBadges[developer];
    }

    /**
     * @notice Returns the PR associated with an SBT.
     */
    function getBadgePR(
        uint256 tokenId
    )
        external
        view
        returns (uint256)
    {
        require(
            _ownerOf(tokenId) != address(0),
            "Badge does not exist"
        );

        return tokenToPR[tokenId];
    }

    /**
     * @notice Makes this NFT Soulbound.
     *
     * Any transfer after minting is rejected.
     *
     * Minting from address(0) is allowed.
     * Burning to address(0) is also allowed internally,
     * but users cannot transfer the badge between wallets.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    )
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);

        /**
         * Allow minting.
         */
        if (from == address(0)) {
            return super._update(
                to,
                tokenId,
                auth
            );
        }

        /**
         * Do not allow transfers or burning.
         */
        revert(
            "Soulbound: token is non-transferable"
        );
    }

    /**
     * @notice Metadata URI for the SBT.
     *
     * You can later replace this with IPFS metadata.
     */
    function tokenURI(
        uint256 tokenId
    )
        public
        view
        override
        returns (string memory)
    {
        require(
            _ownerOf(tokenId) != address(0),
            "Badge does not exist"
        );

        return string(
            abi.encodePacked(
                "devtrust://proof-of-skill/",
                _toString(tokenId)
            )
        );
    }

    /**
     * Minimal uint256 → string conversion.
     */
    function _toString(
        uint256 value
    )
        internal
        pure
        returns (string memory)
    {
        if (value == 0) {
            return "0";
        }

        uint256 temp = value;
        uint256 digits;

        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer =
            new bytes(digits);

        while (value != 0) {
            digits -= 1;

            buffer[digits] =
                bytes1(
                    uint8(
                        48 + uint256(value % 10)
                    )
                );

            value /= 10;
        }

        return string(buffer);
    }

    // =============================================================
    //                 REVIEWER / PR VIEWS
    // =============================================================

    /**
     * @notice Get all reviewer addresses for a PR.
     */
    function getReviewers(
        uint256 prId
    )
        external
        view
        returns (address[] memory)
    {
        return _reviewers[prId];
    }

    /**
     * @notice Get a particular review.
     */
    function getReview(
        uint256 prId,
        address reviewer
    )
        external
        view
        returns (
            address,
            uint256,
            ReviewDecision,
            bool
        )
    {
        Review storage review =
            reviews[prId][reviewer];

        return (
            review.reviewer,
            review.stake,
            review.decision,
            review.settled
        );
    }

    /**
     * @notice Check whether challenge period is complete.
     */
    function challengePeriodOver(
        uint256 prId
    )
        external
        view
        returns (bool)
    {
        PullRequest storage pr =
            pullRequests[prId];

        if (
            pr.status != PRStatus.MERGED
        ) {
            return false;
        }

        return (
            block.timestamp >=
            pr.mergedAt + CHALLENGE_PERIOD
        );
    }

    /**
     * @notice Get complete PR information.
     */
    function getPR(
        uint256 prId
    )
        external
        view
        returns (
            uint256 id,
            uint256 githubPRNumber,
            string memory repository,
            string memory prUrl,
            address developer,
            uint256 developerStake,
            uint256 createdAt,
            uint256 mergedAt,
            PRStatus status,
            bool settled,
            uint256 reviewCount
        )
    {
        PullRequest storage pr =
            pullRequests[prId];

        return (
            pr.id,
            pr.githubPRNumber,
            pr.repository,
            pr.prUrl,
            pr.developer,
            pr.developerStake,
            pr.createdAt,
            pr.mergedAt,
            pr.status,
            pr.settled,
            pr.reviewCount
        );
    }

    /**
     * @notice Find DevTrust PR ID from GitHub repository + PR number.
     */
    function getPRIdFromGitHub(
        string calldata repository,
        uint256 githubPRNumber
    )
        external
        view
        returns (uint256)
    {
        bytes32 githubKey = keccak256(
            abi.encodePacked(
                repository,
                "#",
                githubPRNumber
            )
        );

        return githubPRToDevTrustPR[githubKey];
    }

    // =============================================================
    //                 REPUTATION
    // =============================================================

    /**
     * @notice Get developer reputation information.
     */
    function getDeveloperReputation(
        address developer
    )
        external
        view
        returns (
            uint256 reputationScore,
            uint256 successfulContributionCount,
            uint256 failedContributionCount,
            uint256 badgeCount
        )
    {
        return (
            reputation[developer],
            successfulPRs[developer],
            failedPRs[developer],
            _developerBadges[developer].length
        );
    }

    /**
     * @notice Get reviewer statistics.
     */
    function getReviewerStats(
        address reviewer
    )
        external
        view
        returns (
            uint256 correctReviews,
            uint256 incorrectReviews
        )
    {
        return (
            successfulReviews[reviewer],
            failedReviews[reviewer]
        );
    }

    // =============================================================
    //                 EXISTING RECORD SYSTEM
    // =============================================================

    /**
     * @notice Add an on-chain reputation record.
     *
     * Kept for compatibility with your previous implementation.
     */
    function addRecord(
        address _user,
        string calldata _data
    )
        external
        onlyOwnerOrOracle
    {
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

    // =============================================================
    //                 EXISTING REWARD / SLASH
    // =============================================================

    /**
     * @notice Fund the protocol reward pool.
     *
     * Your company / project owner can send ETH here so that
     * successful reviewers can receive accuracy rewards.
     */
    function fundRewardPool()
        external
        payable
    {
        require(
            msg.value > 0,
            "No ETH supplied"
        );

        rewardPool += msg.value;

        emit RewardPoolFunded(
            msg.sender,
            msg.value
        );
    }

    /**
     * @notice Existing generic reward function retained
     *         for compatibility.
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

        (bool success, ) =
            payable(developer).call{
                value: msg.value
            }("");

        require(
            success,
            "Transfer failed"
        );

        emit Rewarded(
            developer,
            msg.value
        );
    }

    /**
     * @notice Existing generic slash function retained.
     *
     * Slashed generic stake goes to rewardPool.
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

        rewardPool += amount;

        emit Slashed(
            developer,
            amount
        );
    }

    // =============================================================
    //                       ADMIN WITHDRAWAL
    // =============================================================

    /**
     * @notice Withdraw excess protocol funds.
     *
     * This is deliberately restricted to the owner.
     *
     * Do NOT use this to withdraw reviewer/developer funds
     * belonging to active PRs.
     *
     * For a production contract this accounting should be made
     * even more sophisticated.
     */
    function withdrawRewardPool(
        uint256 amount
    )
        external
        onlyOwner
        nonReentrant
    {
        require(
            amount <= rewardPool,
            "Insufficient reward pool"
        );

        rewardPool -= amount;

        (bool success, ) =
            payable(owner).call{
                value: amount
            }("");

        require(
            success,
            "Withdrawal failed"
        );
    }

    // =============================================================
    //                       RECEIVE ETH
    // =============================================================

    receive()
        external
        payable
    {
        rewardPool += msg.value;

        emit RewardPoolFunded(
            msg.sender,
            msg.value
        );
    }
}
