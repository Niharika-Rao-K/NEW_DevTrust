// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * DevTrust
 *
 * Decentralized Peer-Staking / Proof-of-Skill MVP
 *
 * Core workflow:
 *
 * Developer
 *    |
 *    | register PR + developer stake
 *    v
 * GitHub PR
 *    |
 *    | reviewers stake + vote
 *    v
 * Reviewer Consensus
 *    |
 *    | GitHub Oracle confirms merge
 *    v
 * Maintainer / Company
 *    |
 *    | approve / reject
 *    v
 * Settlement
 *    |
 *    +--> APPROVED:
 *    |      - developer stake returned
 *    |      - reviewer stakes returned
 *    |      - reviewer reward distributed
 *    |      - developer reputation increased
 *    |      - Soulbound Skill Token minted
 *    |
 *    +--> REJECTED:
 *           - reviewer stakes slashed
 *           - developer gets no SBT
 *           - no reputation reward
 *
 * IMPORTANT:
 * This is an MVP/PoC contract.
 * The GitHub -> blockchain bridge is still performed by the
 * backend/oracle wallet. A production version could replace
 * the centralized oracle with a decentralized oracle system.
 */
contract DevTrust {

    // ============================================================
    //                         ADMIN
    // ============================================================

    string public trustName;
    uint256 public creationTime;

    address public owner;
    address public oracle;

    /**
     * Treasury receives slashed reviewer stakes.
     *
     * By default this is the contract owner.
     */
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

    event OracleUpdated(address indexed newOracle);

    event TreasuryUpdated(address indexed newTreasury);

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


    // ============================================================
    //                    LEGACY RECORD SYSTEM
    // ============================================================

    /**
     * Kept from your original contract.
     *
     * These records can be used for simple on-chain achievement
     * metadata / historical records.
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
    ) external onlyOwnerOrOracle {

        require(_user != address(0), "Invalid user");

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
        require(index < records.length, "Invalid index");

        TrustRecord storage record = records[index];

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
    //                     GENERIC PLATFORM STAKE
    // ============================================================

    /**
     * Generic stake mapping retained from your old contract.
     *
     * This is NOT the reviewer stake for a PR.
     *
     * PR-specific staking uses:
     *
     *     stakeOnPR()
     */
    mapping(address => uint256) public stakes;

    /**
     * Minimum generic platform stake.
     */
    uint256 public constant MIN_PLATFORM_STAKE = 0.001 ether;

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

    /**
     * PR lifecycle.
     */
    enum PRStatus {
        NONE,
        OPEN,
        MERGED,
        APPROVED,
        REJECTED,
        SETTLED
    }

    /**
     * A Pull Request registered in DevTrust.
     */
    struct PullRequest {

        // Unique DevTrust PR ID
        uint256 id;

        // GitHub repository
        // Example:
        // "owner/repository"
        string repository;

        // GitHub PR number
        uint256 prNumber;

        // Full GitHub PR URL
        string prUrl;

        // Developer who submitted the contribution
        address developer;

        // Developer's ETH commitment
        uint256 developerStake;

        // ETH reserved for reviewer rewards
        uint256 reviewerRewardPool;

        // Amount of reviewer stake currently locked
        uint256 totalReviewerStake;

        // Number of reviewers
        uint256 reviewerCount;

        // Current state
        PRStatus status;

        // Address of the company/project maintainer
        address company;

        // When PR was registered
        uint256 createdAt;

        // When merge was verified
        uint256 mergedAt;

        // Challenge period deadline
        uint256 challengeDeadline;

        // GitHub merge commit
        string mergeCommit;

        // Whether settlement has happened
        bool settled;
    }

    /**
     * Every PR gets a unique DevTrust ID.
     */
    uint256 public nextPRId = 1;

    /**
     * PR ID => PullRequest
     */
    mapping(uint256 => PullRequest) public pullRequests;


    // ============================================================
    //                      REVIEW SYSTEM
    // ============================================================

    /**
     * Reviewer information for one PR.
     */
    struct Review {

        // Reviewer wallet
        address reviewer;

        // ETH locked by reviewer
        uint256 stake;

        // true  = reviewer predicts successful contribution
        // false = reviewer predicts bad contribution
        bool approveVote;

        // Prevents duplicate settlement
        bool settled;

        // Prevents accidental duplicate reviews
        bool exists;
    }

    /**
     * PR ID => reviewer address => Review
     */
    mapping(uint256 => mapping(address => Review))
        public reviews;

    /**
     * PR ID => reviewer addresses
     *
     * Used for settlement.
     */
    mapping(uint256 => address[])
        private reviewerList;


    // ============================================================
    //                     CONFIGURATION
    // ============================================================

    /**
     * Minimum developer stake required for a PR.
     */
    uint256 public constant MIN_DEVELOPER_STAKE =
        0.001 ether;

    /**
     * Minimum reviewer stake.
     */
    uint256 public constant MIN_REVIEWER_STAKE =
        0.001 ether;

    /**
     * Challenge period.
     *
     * For your demo you can set this to a small value.
     *
     * Current value:
     * 1 day
     *
     * Production could use 7 days.
     */
    uint256 public challengePeriod =
        1 days;

    /**
     * Reviewer reward percentage.
     *
     * Example:
     *
     * reviewerRewardPool = 0.01 ETH
     *
     * 10% is NOT deducted from the reviewer stake.
     *
     * The reward pool is separate ETH deposited by the company.
     *
     * Each successful reviewer receives a proportional share.
     */
    uint256 public constant MAX_REVIEWERS = 50;


    // ============================================================
    //                     REPUTATION SYSTEM
    // ============================================================

    /**
     * Developer reputation.
     *
     * This is a simple MVP reputation score.
     *
     * Every successfully verified PR:
     *
     *     +100 reputation
     */
    mapping(address => uint256)
        public reputation;

    uint256 public constant REPUTATION_PER_SUCCESS =
        100;


    // ============================================================
    //                  SOULBOUND TOKEN SYSTEM
    // ============================================================

    /**
     * Minimal SBT implementation.
     *
     * These tokens cannot be transferred.
     *
     * They are minted only for successful DevTrust
     * contributions.
     */
    string public constant SBT_NAME =
        "DevTrust Proof of Skill";

    string public constant SBT_SYMBOL =
        "DTS";

    /**
     * Token counter.
     */
    uint256 public nextTokenId = 1;

    /**
     * tokenId => owner
     */
    mapping(uint256 => address)
        private sbtOwner;

    /**
     * owner => balance
     */
    mapping(address => uint256)
        private sbtBalance;

    /**
     * tokenId => PR ID
     *
     * Allows anyone to determine which contribution
     * generated a particular SBT.
     */
    mapping(uint256 => uint256)
        public tokenPR;

    /**
     * tokenId => developer
     */
    mapping(uint256 => address)
        public tokenDeveloper;

    /**
     * developer => token IDs
     */
    mapping(address => uint256[])
        private developerTokens;

    event Transfer(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId
    );


    // ============================================================
    //                REGISTER A PULL REQUEST
    // ============================================================

    /**
     * @notice Register a GitHub PR in DevTrust.
     *
     * The developer sends ETH with this transaction.
     *
     * The company/project can also fund a reviewer reward pool.
     *
     * Example:
     *
     * Developer:
     *     0.01 ETH developer stake
     *
     * Company:
     *     0.02 ETH reviewer reward pool
     *
     * For the MVP, the developer calls this function and
     * sends:
     *
     *     developerStake + reviewerRewardPool
     *
     * The backend/frontend can make this easy for the user.
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
            msg.value - reviewerRewardPool;

        require(
            developerStake >= MIN_DEVELOPER_STAKE,
            "Developer stake too small"
        );

        uint256 prId = nextPRId++;

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
     * @notice Reviewer stakes ETH and votes on a PR.
     *
     * approveVote:
     *
     *     true  -> reviewer says "this contribution is good"
     *     false -> reviewer says "this contribution is bad"
     *
     * The reviewer must put ETH behind their opinion.
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
            msg.sender != address(0),
            "Invalid reviewer"
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
    //                    REVIEWER INFORMATION
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
     * @notice Backend/oracle tells the contract that GitHub
     *         confirms the PR was merged.
     *
     * The oracle DOES NOT decide whether the contribution
     * deserves the final reward.
     *
     * It only provides the external GitHub fact:
     *
     *     "This PR was merged."
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

        pr.status = PRStatus.MERGED;

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
     * @notice Company/project maintainer approves the PR.
     *
     * This is the final positive decision.
     *
     * Requirements:
     *
     *     1. PR must have been merged.
     *     2. Challenge period must have passed.
     *     3. Caller must be the company assigned to this PR.
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
     * @notice Company/project maintainer rejects the PR.
     *
     * A rejection means the reviewers who supported the
     * contribution lose their stake.
     *
     * For the MVP, the company can reject after GitHub
     * has confirmed the PR was merged.
     *
     * This allows the project to demonstrate both:
     *
     *     APPROVED
     *
     * and
     *
     *     REJECTED
     *
     * outcomes.
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
     * @notice Settle an approved or rejected PR.
     *
     * Anyone can trigger settlement once the company has
     * made the final decision.
     *
     * This is deliberately permissionless.
     *
     * The caller does NOT receive the funds.
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

        pr.settled = true;

        bool approved =
            pr.status == PRStatus.APPROVED;

        address developer =
            pr.developer;

        uint256 reviewerCount =
            reviewerList[prId].length;

        uint256 totalReviewerStake =
            pr.totalReviewerStake;


        // ========================================================
        //                    APPROVED CASE
        // ========================================================

        if (approved) {

            /**
             * Return developer stake.
             */
            if (pr.developerStake > 0) {

                uint256 developerStake =
                    pr.developerStake;

                pr.developerStake = 0;

                (bool developerPaid,) =
                    payable(developer).call{
                        value: developerStake
                    }("");

                require(
                    developerPaid,
                    "Developer payment failed"
                );

                emit DeveloperStakeReturned(
                    prId,
                    developer,
                    developerStake
                );
            }


            /**
             * Count approving reviewers.
             */
            uint256 approvingReviewers = 0;

            for (
                uint256 i = 0;
                i < reviewerCount;
                i++
            ) {

                address reviewer =
                    reviewerList[prId][i];

                Review storage review =
                    reviews[prId][reviewer];

                if (review.approveVote) {
                    approvingReviewers++;
                }
            }


            /**
             * Reward pool is distributed only among
             * reviewers who voted correctly.
             *
             * Their original stake is also returned.
             */
            uint256 rewardPool =
                pr.reviewerRewardPool;

            uint256 rewardPerReviewer = 0;

            if (
                approvingReviewers > 0 &&
                rewardPool > 0
            ) {
                rewardPerReviewer =
                    rewardPool /
                    approvingReviewers;
            }


            /**
             * Settle every reviewer.
             */
            for (
                uint256 i = 0;
                i < reviewerCount;
                i++
            ) {

                address reviewer =
                    reviewerList[prId][i];

                Review storage review =
                    reviews[prId][reviewer];

                if (review.settled) {
                    continue;
                }

                review.settled = true;

                if (review.approveVote) {

                    uint256 reviewerStake =
                        review.stake;

                    uint256 reward =
                        rewardPerReviewer;

                    review.stake = 0;

                    /**
                     * Return stake + reward.
                     */
                    (bool paid,) =
                        payable(reviewer).call{
                            value:
                                reviewerStake +
                                reward
                        }("");

                    require(
                        paid,
                        "Reviewer payment failed"
                    );

                    emit ReviewerRewarded(
                        prId,
                        reviewer,
                        reviewerStake,
                        reward
                    );

                } else {

                    /**
                     * Reviewer's prediction was wrong.
                     *
                     * Their stake is sent to treasury.
                     */
                    uint256 slashAmount =
                        review.stake;

                    review.stake = 0;

                    (bool slashed,) =
                        payable(treasury).call{
                            value: slashAmount
                        }("");

                    require(
                        slashed,
                        "Slash transfer failed"
                    );

                    emit ReviewerSlashed(
                        prId,
                        reviewer,
                        slashAmount
                    );
                }
            }


            /**
             * Reviewer reward pool has now been consumed.
             */
            pr.reviewerRewardPool = 0;


            /**
             * Increase developer reputation.
             */
            reputation[developer] +=
                REPUTATION_PER_SUCCESS;

            emit DeveloperReputationUpdated(
                developer,
                reputation[developer]
            );


            /**
             * Mint Proof of Skill SBT.
             */
            _mintSkillSBT(
                developer,
                prId
            );
        }


        // ========================================================
        //                    REJECTED CASE
        // ========================================================

        else {

            /**
             * Developer gets their original stake back.
             *
             * The project can later be modified so that
             * developer stake is also slashed if desired.
             *
             * For the current project idea, the economic
             * penalty is focused on dishonest/wrong reviewers.
             */
            if (pr.developerStake > 0) {

                uint256 developerStake =
                    pr.developerStake;

                pr.developerStake = 0;

                (bool developerPaid,) =
                    payable(developer).call{
                        value: developerStake
                    }("");

                require(
                    developerPaid,
                    "Developer refund failed"
                );

                emit DeveloperStakeReturned(
                    prId,
                    developer,
                    developerStake
                );
            }


            /**
             * Every reviewer loses their stake.
             */
            for (
                uint256 i = 0;
                i < reviewerCount;
                i++
            ) {

                address reviewer =
                    reviewerList[prId][i];

                Review storage review =
                    reviews[prId][reviewer];

                if (review.settled) {
                    continue;
                }

                review.settled = true;

                uint256 slashAmount =
                    review.stake;

                review.stake = 0;

                if (slashAmount > 0) {

                    (bool slashed,) =
                        payable(treasury).call{
                            value: slashAmount
                        }("");

                    require(
                        slashed,
                        "Slash transfer failed"
                    );

                    emit ReviewerSlashed(
                        prId,
                        reviewer,
                        slashAmount
                    );
                }
            }


            /**
             * No reviewer reward is paid after rejection.
             */
            pr.reviewerRewardPool = 0;
        }


        /**
         * Final state.
         */
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
    //                    SBT IMPLEMENTATION
    // ============================================================

    /**
     * @notice Mint a non-transferable Proof of Skill token.
     *
     * Only this contract's internal settlement logic can
     * create one.
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


    /**
     * Standard-style ownerOf.
     */
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


    /**
     * Standard-style balanceOf.
     */
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


    /**
     * Get all SBT IDs owned by a developer.
     */
    function getDeveloperTokens(
        address developer
    )
        external
        view
        returns (uint256[] memory)
    {
        return developerTokens[developer];
    }


    /**
     * Returns SBT metadata information.
     *
     * For this MVP we keep metadata directly associated
     * with the PR ID.
     */
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

        prId =
            tokenPR[tokenId];

        require(
            developer != address(0),
            "SBT does not exist"
        );

        PullRequest storage pr =
            pullRequests[prId];

        repository =
            pr.repository;

        prNumber =
            pr.prNumber;
    }


    // ============================================================
    //             SOULBOUND / NON-TRANSFERABILITY
    // ============================================================

    /**
     * There is intentionally NO transfer function.
     *
     * Therefore the SBT cannot be transferred.
     *
     * The only movement supported is:
     *
     *     address(0) -> developer
     *
     * during minting.
     *
     * There is also no approve() or setApprovalForAll().
     *
     * This makes the token effectively soulbound.
     */


    // ============================================================
    //                  PR VIEW FUNCTIONS
    // ============================================================

    function getPR(
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
            uint256 developerStake,
            uint256 reviewerRewardPool,
            uint256 totalReviewerStake,
            uint256 reviewerCount,
            PRStatus status,
            address company,
            uint256 createdAt,
            uint256 mergedAt,
            uint256 challengeDeadline,
            string memory mergeCommit,
            bool settled
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
            pr.developerStake,
            pr.reviewerRewardPool,
            pr.totalReviewerStake,
            pr.reviewerCount,
            pr.status,
            pr.company,
            pr.createdAt,
            pr.mergedAt,
            pr.challengeDeadline,
            pr.mergeCommit,
            pr.settled
        );
    }


    // ============================================================
    //                     ADMIN FUNCTIONS
    // ============================================================

    /**
     * Change oracle wallet.
     */
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


    /**
     * Change treasury.
     */
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
     *
     * Existing PRs retain their own deadline.
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


    /**
     * Emergency owner withdrawal.
     *
     * This should only be used for ETH that is NOT
     * locked inside active PRs.
     *
     * For the MVP, avoid using this during a live demo.
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
     * Kept for compatibility with your old backend.
     *
     * IMPORTANT:
     * New DevTrust PR workflow should use:
     *
     *     settlePR()
     *
     * rather than these functions.
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
     * New PR settlement should use settlePR().
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
     * Do not use direct transfers for PR staking.
     * Use registerPR() or stakeOnPR().
     */
    receive()
        external
        payable
    {}
}

