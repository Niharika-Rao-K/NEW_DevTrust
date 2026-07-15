import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { CONTRACT_ADDRESS, CONTRACT_ABI, MIN_STAKE_ETH } from "./constants";

// ─── Read: Is the connected wallet staked? ────────────────────────────────────
export function useIsStaked() {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "isStaked",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
}

// ─── Read: Stake amount for the connected wallet ──────────────────────────────
export function useStakeAmount() {
  const { address } = useAccount();
  const result = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "stakes",
    args: address ? [address] : undefined,
    query: { enabled: !!address,
      refetchInterval: 5000,  // poll every 5 seconds
      staleTime: 0,
     },
    
  });
  const formatted = result.data ? formatEther(result.data as bigint) : "0";
  return { ...result, formatted };
}

// ─── Read: Total contribution records ────────────────────────────────────────
export function useTotalRecords() {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getTotalRecords",
  });
}

// ─── Read: Trust info (name + creation time) ─────────────────────────────────
export function useTrustInfo() {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getTrustInfo",
  });
}

// ─── Read: A specific record by index ────────────────────────────────────────
export function useRecord(index: bigint | undefined) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getRecord",
    args: index !== undefined ? [index] : undefined,
    query: { enabled: index !== undefined },
  });
}

// ─── Write: Stake ETH ─────────────────────────────────────────────────────────
export function useStake() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const stake = () => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "stake",
      value: parseEther(MIN_STAKE_ETH),
    });
  };

  return {
    stake,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    isLoading: isPending || isConfirming,
  };
}

// ─── Write: Stake a custom ETH amount (for reviewer project staking) ──────────
export function useStakeCustomAmount() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const stake = (ethAmount: string) => {
    const parsed = parseFloat(ethAmount);
    if (isNaN(parsed) || parsed <= 0) return;
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "stake",
      value: parseEther(ethAmount),
    });
  };

  return {
    stake,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    isLoading: isPending || isConfirming,
  };
}