
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther } from "viem";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "./constants";

/* ============================================================
   DEVTRUST V3 READ HOOKS
   ============================================================ */

/**
 * Read the next DevTrust PR ID.
 *
 * The next PR registered will receive this ID.
 */
export function useNextPRId() {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "nextPRId",
  });
}

/**
 * Read basic information about a PR.
 */
export function usePRBasic(prId: bigint | undefined) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getPRBasic",
    args: prId !== undefined ? [prId] : undefined,
    query: {
      enabled: prId !== undefined,
      refetchInterval: 5000,
    },
  });
}

/**
 * Read PR staking information.
 *
 * Returns the existing v2-compatible four values:
 * - developer stake
 * - reviewer reward pool
 * - total reviewer stake
 * - reviewer count
 */
export function usePRStaking(prId: bigint | undefined) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getPRStaking",
    args: prId !== undefined ? [prId] : undefined,
    query: {
      enabled: prId !== undefined,
      refetchInterval: 5000,
    },
  });
}

/**
 * Read the company-defined minimum reviewer stake
 * and whether the PR is eligible for company testing.
 *
 * Returns:
 * [minReviewerStake, testingEligible]
 */
export function usePRThreshold(prId: bigint | undefined) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getPRThreshold",
    args: prId !== undefined ? [prId] : undefined,
    query: {
      enabled: prId !== undefined,
      refetchInterval: 5000,
    },
  });
}

/**
 * Read the complete testing eligibility state.
 *
 * Returns:
 * [totalReviewerStake, minReviewerStake, testingEligible]
 */
export function useTestingEligibility(prId: bigint | undefined) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getTestingEligibility",
    args: prId !== undefined ? [prId] : undefined,
    query: {
      enabled: prId !== undefined,
      refetchInterval: 5000,
    },
  });
}

/**
 * Read whether a PR is eligible for company testing.
 */
export function useIsEligibleForTesting(prId: bigint | undefined) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "isEligibleForTesting",
    args: prId !== undefined ? [prId] : undefined,
    query: {
      enabled: prId !== undefined,
      refetchInterval: 5000,
    },
  });
}

/**
 * Read PR status.
 *
 * Status enum:
 * 0 = NONE
 * 1 = OPEN
 * 2 = MERGED
 * 3 = APPROVED
 * 4 = REJECTED
 * 5 = SETTLED
 */
export function usePRStatus(prId: bigint | undefined) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getPRStatus",
    args: prId !== undefined ? [prId] : undefined,
    query: {
      enabled: prId !== undefined,
      refetchInterval: 5000,
    },
  });
}

/**
 * Read merge and challenge information.
 */
export function usePRMergeInfo(prId: bigint | undefined) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getPRMergeInfo",
    args: prId !== undefined ? [prId] : undefined,
    query: {
      enabled: prId !== undefined,
      refetchInterval: 5000,
    },
  });
}

/**
 * Read a reviewer's review for a PR.
 *
 * If reviewer is not supplied, the connected wallet
 * is used automatically.
 */
export function useReview(
  prId: bigint | undefined,
  reviewer?: `0x${string}`
) {
  const { address } = useAccount();

  const reviewerAddress = reviewer ?? address;

  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getReview",
    args:
      prId !== undefined && reviewerAddress
        ? [prId, reviewerAddress]
        : undefined,
    query: {
      enabled: prId !== undefined && !!reviewerAddress,
      refetchInterval: 5000,
    },
  });
}

/**
 * Read the number of reviewers who have staked on a PR.
 */
export function useReviewerCount(prId: bigint | undefined) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getReviewerCount",
    args: prId !== undefined ? [prId] : undefined,
    query: {
      enabled: prId !== undefined,
      refetchInterval: 5000,
    },
  });
}

/**
 * Read a reviewer address by index.
 */
export function useReviewerAt(
  prId: bigint | undefined,
  index: bigint | undefined
) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getReviewerAt",
    args:
      prId !== undefined && index !== undefined
        ? [prId, index]
        : undefined,
    query: {
      enabled: prId !== undefined && index !== undefined,
      refetchInterval: 5000,
    },
  });
}

/**
 * Read developer reputation.
 */
export function useDeveloperReputation(
  developer?: `0x${string}`
) {
  const { address } = useAccount();

  const developerAddress = developer ?? address;

  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "reputation",
    args: developerAddress ? [developerAddress] : undefined,
    query: {
      enabled: !!developerAddress,
      refetchInterval: 5000,
    },
  });
}

/**
 * Read SBT information by token ID.
 *
 * DevTrust v3 getSBTInfo() expects a token ID,
 * not a developer wallet address.
 */
export function useSBTInfo(tokenId?: bigint) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getSBTInfo",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: {
      enabled: tokenId !== undefined,
      refetchInterval: 5000,
    },
  });
}

/**
 * Read the token IDs owned by a developer.
 *
 * Useful if the v3 UI needs to display the developer's
 * Proof-of-Skill SBTs.
 */
export function useDeveloperTokens(
  developer?: `0x${string}`
) {
  const { address } = useAccount();

  const developerAddress = developer ?? address;

  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getDeveloperTokens",
    args: developerAddress ? [developerAddress] : undefined,
    query: {
      enabled: !!developerAddress,
      refetchInterval: 5000,
    },
  });
}

/* ============================================================
   DEVTRUST V3 WRITE HOOKS
   ============================================================ */

/**
 * Register a GitHub pull request on DevTrust v3.
 *
 * Contract arguments:
 * - repository
 * - prNumber
 * - prUrl
 * - company
 * - reviewerRewardPool
 * - minReviewerStake
 *
 * msg.value:
 * developerStake + reviewerRewardPool
 */
export function useRegisterPR() {
  const {
    writeContract,
    data: hash,
    isPending,
    error,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
  } = useWaitForTransactionReceipt({
    hash,
  });

  const registerPR = (
    repository: string,
    prNumber: bigint,
    prUrl: string,
    company: `0x${string}`,
    reviewerRewardPoolEth: string,
    minReviewerStakeEth: string,
    totalValueEth: string
  ) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "registerPR",
      args: [
        repository,
        prNumber,
        prUrl,
        company,
        parseEther(reviewerRewardPoolEth),
        parseEther(minReviewerStakeEth),
      ],
      value: parseEther(totalValueEth),
    });
  };

  return {
    registerPR,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    isLoading: isPending || isConfirming,
  };
}

/**
 * Stake on a PR as a reviewer.
 *
 * approveVote:
 *   true  = approve
 *   false = reject
 *
 * The ETH amount is supplied as msg.value.
 *
 * In v3, when total reviewer stake reaches the
 * company-defined minimum reviewer stake, the
 * contract automatically marks the PR as
 * eligible for company testing.
 */
export function useStakeOnPR() {
  const {
    writeContract,
    data: hash,
    isPending,
    error,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
  } = useWaitForTransactionReceipt({
    hash,
  });

  const stakeOnPR = (
    prId: bigint,
    approveVote: boolean,
    ethAmount: string
  ) => {
    const parsed = parseFloat(ethAmount);

    if (Number.isNaN(parsed) || parsed <= 0) {
      return;
    }

    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "stakeOnPR",
      args: [prId, approveVote],
      value: parseEther(ethAmount),
    });
  };

  return {
    stakeOnPR,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    isLoading: isPending || isConfirming,
  };
}

/**
 * Company approves a merged PR after the challenge period.
 */
export function useApprovePR() {
  const {
    writeContract,
    data: hash,
    isPending,
    error,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
  } = useWaitForTransactionReceipt({
    hash,
  });

  const approvePR = (prId: bigint) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "approvePR",
      args: [prId],
    });
  };

  return {
    approvePR,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    isLoading: isPending || isConfirming,
  };
}

/**
 * Company rejects a merged PR after the challenge period.
 */
export function useRejectPR() {
  const {
    writeContract,
    data: hash,
    isPending,
    error,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
  } = useWaitForTransactionReceipt({
    hash,
  });

  const rejectPR = (prId: bigint) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "rejectPR",
      args: [prId],
    });
  };

  return {
    rejectPR,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    isLoading: isPending || isConfirming,
  };
}

/**
 * Settle an approved/rejected PR.
 *
 * Can be called by any account once the PR
 * has been approved or rejected.
 */
export function useSettlePR() {
  const {
    writeContract,
    data: hash,
    isPending,
    error,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
  } = useWaitForTransactionReceipt({
    hash,
  });

  const settlePR = (prId: bigint) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "settlePR",
      args: [prId],
    });
  };

  return {
    settlePR,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    isLoading: isPending || isConfirming,
  };
}

/* ============================================================
   LEGACY COMPATIBILITY READ HOOKS
   ============================================================

   These are retained temporarily because older UI components
   in DashboardSection.tsx still reference the old interface.

   They do not represent the actual v3 reviewer-staking flow.
   ============================================================ */

/**
 * Legacy global-staking compatibility hook.
 *
 * v3 uses stakeOnPR() instead of a global isStaked() state.
 */
export function useIsStaked() {
  return {
    data: false,
    isLoading: false,
    isError: false,
    error: null,
  };
}

/**
 * Legacy global-stake amount compatibility hook.
 */
export function useStakeAmount() {
  return {
    data: 0n,
    formatted: "0",
    isLoading: false,
    isError: false,
    error: null,
  };
}

/**
 * Legacy record-count compatibility hook.
 */
export function useTotalRecords() {
  return {
    data: 0n,
    isLoading: false,
    isError: false,
    error: null,
  };
}

/**
 * Legacy trust-information hook.
 *
 * The underlying getter is still present in the v3 contract.
 */
export function useTrustInfo() {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getTrustInfo",
  });
}

/**
 * Legacy record getter.
 */
export function useRecord(index: bigint | undefined) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getRecord",
    args: index !== undefined ? [index] : undefined,
    query: {
      enabled: index !== undefined,
    },
  });
}

/**
 * Legacy global stake() compatibility hook.
 *
 * The actual reviewer flow is useStakeOnPR().
 */
export function useStake() {
  return {
    stake: () => {
      console.warn(
        "The legacy stake() function is not available in DevTrust v3. Use stakeOnPR() instead."
      );
    },
    hash: undefined,
    isPending: false,
    isConfirming: false,
    isSuccess: false,
    error: null,
    isLoading: false,
  };
}

/**
 * Legacy custom-stake compatibility hook.
 *
 * The actual reviewer flow is useStakeOnPR().
 */
export function useStakeCustomAmount() {
  return {
    stake: (_ethAmount: string) => {
      console.warn(
        "The legacy stake() function is not available in DevTrust v3. Use stakeOnPR() instead."
      );
    },
    hash: undefined,
    isPending: false,
    isConfirming: false,
    isSuccess: false,
    error: null,
    isLoading: false,
  };
}
