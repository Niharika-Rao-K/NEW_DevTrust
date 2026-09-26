import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "./constants";

/* ============================================================
   V2 READ HOOKS
   ============================================================ */

/**
 * Read the next DevTrust PR ID.
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
    },
  });
}

/**
 * Read PR staking information.
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
 * Read PR status.
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
 * Read merge/challenge information.
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
 * Read number of reviewers for a PR.
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
 * Read SBT information for a developer.
 */
export function useSBTInfo(
  developer?: `0x${string}`
) {
  const { address } = useAccount();

  const developerAddress = developer ?? address;

  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getSBTInfo",
    args: developerAddress ? [developerAddress] : undefined,
    query: {
      enabled: !!developerAddress,
      refetchInterval: 5000,
    },
  });
}

/* ============================================================
   V2 WRITE HOOKS
   ============================================================ */

/**
 * Register a GitHub pull request on DevTrust.
 *
 * developerStake + reviewerRewardPool = msg.value
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
 * This can be called by any account once the PR
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
   
   These are temporarily retained so existing UI components
   can compile while we migrate them from the v1 interface.
   
   They intentionally do NOT call removed v1 contract methods.
   ============================================================ */

/**
 * v1 compatibility hook.
 *
 * DevTrust v2 no longer has a global isStaked(address)
 * concept. Reviewers stake against individual PRs instead.
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
 * v1 compatibility hook.
 *
 * DevTrust v2 stores reviewer stakes per PR.
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
 * v1 compatibility hook.
 *
 * v2 uses PRs rather than the old contribution records.
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
 * v1 compatibility hook.
 */
export function useTrustInfo() {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getTrustInfo",
  });
}

/**
 * v1 compatibility hook.
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
 * v1 compatibility write hook.
 *
 * The old global stake() function no longer exists in v2.
 * Kept only so old UI code does not immediately fail to compile.
 */
export function useStake() {
  return {
    stake: () => {
      console.warn(
        "The legacy stake() function is not available in DevTrust v2. Use stakeOnPR() instead."
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
 * v1 compatibility write hook.
 */
export function useStakeCustomAmount() {
  return {
    stake: (_ethAmount: string) => {
      console.warn(
        "The legacy stake() function is not available in DevTrust v2. Use stakeOnPR() instead."
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