import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import {
  Award,
  Code2,
  CheckCircle,
  Lock,
  Loader2,
  ExternalLink,
  GitMerge,
  Sparkles,
  TrendingUp,
  Shield,
  AlertCircle,
  Clock,
  GitBranch,
  Users,
  Wallet,
  CircleDollarSign,
  RefreshCw,
} from "lucide-react";

import { useUserRoles } from "./UserRolesContext";
import { useGitHubAuth } from "./GitHubAuth";
import {
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
} from "./constants";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DeveloperPR {
  id: bigint;
  repository: string;
  prNumber: bigint;
  prUrl: string;
  developer: string;
  company: string;

  developerStake: bigint;
  reviewerRewardPool: bigint;
  totalReviewerStake: bigint;
  reviewerCount: bigint;

  status: number;
  createdAt: bigint;
  mergedAt: bigint;
  challengeDeadline: bigint;
  settled: boolean;

  mergeCommit: string;
}

interface SBTInfo {
  tokenId: bigint;
  prId: bigint;
  exists: boolean;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatEth(value: bigint | undefined) {
  if (value === undefined) return "0";

  const eth = Number(value) / 1e18;

  if (eth === 0) return "0";
  if (eth < 0.000001) return eth.toExponential(2);

  return eth.toFixed(4);
}

function formatAddress(address: string | undefined) {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatDate(timestamp: bigint | undefined) {
  if (!timestamp || timestamp === 0n) return "—";

  return new Date(Number(timestamp) * 1000).toLocaleString();
}

function statusName(status: number) {
  /*
   * DevTrust v2 PRStatus:
   *
   * 0 = REGISTERED
   * 1 = STAKING
   * 2 = MERGED
   * 3 = APPROVED
   * 4 = REJECTED
   * 5 = SETTLED
   */

  switch (status) {
    case 0:
      return "Registered";
    case 1:
      return "Staking";
    case 2:
      return "Merged";
    case 3:
      return "Approved";
    case 4:
      return "Rejected";
    case 5:
      return "Settled";
    default:
      return "Unknown";
  }
}

function statusColor(status: number) {
  switch (status) {
    case 3:
    case 5:
      return "#10b981";

    case 4:
      return "#f87171";

    case 2:
      return "#00f0ff";

    case 1:
      return "#f59e0b";

    default:
      return "#9ca3af";
  }
}

/* -------------------------------------------------------------------------- */
/* On-chain developer data                                                    */
/* -------------------------------------------------------------------------- */

function useDeveloperChainData() {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [prs, setPrs] = useState<DeveloperPR[]>([]);
  const [reputation, setReputation] = useState<bigint>(0n);
  const [sbt, setSbt] = useState<SBTInfo>({
    tokenId: 0n,
    prId: 0n,
    exists: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (!address || !publicClient) {
      setPrs([]);
      setReputation(0n);
      setSbt({
        tokenId: 0n,
        prId: 0n,
        exists: false,
      });
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [nextIdResult, reputationResult] = await Promise.all([
  publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "nextPRId",
  }),

  publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "reputation",
    args: [address],
  }),
]);

const nextId = Number(nextIdResult as bigint);

setReputation(reputationResult as bigint);

/*
 * getSBTInfo() intentionally reverts when the developer does not
 * have a Proof-of-Skill SBT yet. Treat that as a valid "not issued"
 * state rather than failing the entire dashboard load.
 */
try {
  const sbtResult = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getSBTInfo",
    args: [address],
  });

  const sbtResultArray = sbtResult as readonly [
    bigint,
    bigint,
    boolean
  ];

  setSbt({
    tokenId: sbtResultArray[0],
    prId: sbtResultArray[1],
    exists: sbtResultArray[2],
  });
} catch (sbtError) {
  console.info("No Proof-of-Skill SBT issued yet.", sbtError);

  setSbt({
    tokenId: 0n,
    prId: 0n,
    exists: false,
  });
}

      const developerAddress = address.toLowerCase();

      const foundPRs: DeveloperPR[] = [];

      /*
       * The current contract does not expose getDeveloperPRs(address).
       *
       * For the MVP/frontend we therefore scan the existing PR IDs and
       * select records whose on-chain developer address matches the
       * connected wallet.
       */
      for (let prId = 1; prId < nextId; prId++) {
        try {
          const [basic, staking, status, mergeInfo] = await Promise.all([
            publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: "getPRBasic",
              args: [BigInt(prId)],
            }),

            publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: "getPRStaking",
              args: [BigInt(prId)],
            }),

            publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: "getPRStatus",
              args: [BigInt(prId)],
            }),

            publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: "getPRMergeInfo",
              args: [BigInt(prId)],
            }),
          ]);

          const basicData = basic as readonly [
            bigint,
            string,
            bigint,
            string,
            `0x${string}`,
            `0x${string}`
          ];

          const stakingData = staking as readonly [
            bigint,
            bigint,
            bigint,
            bigint
          ];

          const statusData = status as readonly [
            number,
            bigint,
            bigint,
            bigint,
            boolean
          ];

          const mergeData = mergeInfo as readonly [
            string,
            bigint,
            string,
            string
          ];

          const developer = basicData[4];

          if (developer.toLowerCase() !== developerAddress) {
            continue;
          }

          foundPRs.push({
            id: basicData[0],
            repository: basicData[1],
            prNumber: basicData[2],
            prUrl: basicData[3],
            developer: basicData[4],
            company: basicData[5],

            developerStake: stakingData[0],
            reviewerRewardPool: stakingData[1],
            totalReviewerStake: stakingData[2],
            reviewerCount: stakingData[3],

            status: Number(statusData[0]),
            createdAt: statusData[1],
            mergedAt: statusData[2],
            challengeDeadline: statusData[3],
            settled: statusData[4],

            mergeCommit: mergeData[3],
          });
        } catch (prError) {
          /*
           * One malformed/non-readable PR should not prevent the
           * developer dashboard from displaying other records.
           */
          console.warn(`Could not read DevTrust PR #${prId}`, prError);
        }
      }

      setPrs(foundPRs.reverse());
    } catch (err) {
      console.error("Failed to load DevTrust developer data:", err);
      setError("Could not load on-chain developer data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [address, publicClient]);

  return {
    prs,
    reputation,
    sbt,
    loading,
    error,
    refresh: load,
  };
}

/* -------------------------------------------------------------------------- */
/* Reputation Card                                                            */
/* -------------------------------------------------------------------------- */

function DevTrustScoreCard({
  reputation,
  verifiedPRs,
  sbtExists,
}: {
  reputation: bigint;
  verifiedPRs: number;
  sbtExists: boolean;
}) {
  const reputationNumber = Number(reputation);

  /*
   * The contract stores reputation directly.
   * It is NOT converted into a fabricated /100 score.
   *
   * The visual ring is capped at 100 only for presentation.
   */
  const displayScore = Math.min(100, reputationNumber);

  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  const strokeDashoffset =
    circumference * (1 - displayScore / 100);

  const color =
    reputationNumber >= 100
      ? "#10b981"
      : reputationNumber > 0
        ? "#00f0ff"
        : "#6b7280";

  return (
    <div className="glass-strong rounded-2xl border border-white/10 p-8 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-5 rounded-2xl"
        style={{
          background: `radial-gradient(circle at 30% 50%, ${color}, transparent 60%)`,
        }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-[#00f0ff]" />

          <span className="text-sm font-semibold text-gray-300 uppercase tracking-widest">
            On-chain Reputation
          </span>
        </div>

        <div className="flex items-center gap-8">
          <div className="relative w-36 h-36 flex-shrink-0">
            <svg
              className="w-36 h-36 -rotate-90"
              viewBox="0 0 128 128"
            >
              <circle
                cx="64"
                cy="64"
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="10"
              />

              <circle
                cx="64"
                cy="64"
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{
                  filter: `drop-shadow(0 0 8px ${color})`,
                  transition: "stroke-dashoffset 1s ease",
                }}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-4xl font-bold"
                style={{
                  color,
                  fontFamily: "var(--font-display)",
                }}
              >
                {reputationNumber}
              </span>

              <span className="text-xs text-gray-500">
                reputation
              </span>
            </div>
          </div>

          <div className="space-y-3 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">
                Verified / recorded PRs
              </span>

              <span className="font-semibold text-white">
                {verifiedPRs}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">
                Proof-of-Skill SBT
              </span>

              <span
                className="font-semibold"
                style={{
                  color: sbtExists ? "#10b981" : "#6b7280",
                }}
              >
                {sbtExists ? "Issued" : "Not issued"}
              </span>
            </div>

            <div className="mt-3 pt-3 border-t border-white/10 text-xs text-gray-500">
              Reputation is read directly from the DevTrust smart contract.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Submit Contribution                                                        */
/* -------------------------------------------------------------------------- */

function SubmitContribution() {
  const [prUrl, setPrUrl] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

  const handleSubmit = async () => {
    if (!prUrl.trim()) return;

    setStatus("loading");
    setMessage("");

    const trimmed = prUrl.trim();

    try {
      const match = trimmed.match(
        /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/
      );

      if (!match) {
        setStatus("error");
        setMessage(
          "Enter a valid GitHub pull request URL."
        );
        return;
      }

      const repository = `${match[1]}/${match[2]}`;
      const prNumber = match[3];

      const response = await fetch(
        `${BACKEND_URL}/api/pr?repository=${encodeURIComponent(
          repository
        )}&prNumber=${prNumber}`
      );

      if (!response.ok) {
        throw new Error("Backend request failed");
      }

      const data = await response.json();

      if (data?.prId) {
        setStatus("success");
        setMessage(
          `DevTrust PR #${data.prId} found on-chain. The oracle verification status is shown in your PR history below.`
        );
      } else {
        setStatus("error");
        setMessage(
          "No matching DevTrust PR was found. Register the PR through the developer workflow first."
        );
      }
    } catch (error) {
      console.error(error);

      setStatus("error");
      setMessage(
        "Could not reach the DevTrust backend. Please try again."
      );
    }
  };

  return (
    <div className="glass-strong rounded-2xl border border-white/10 p-8">
      <div className="flex items-center gap-2 mb-6">
        <GitMerge className="w-5 h-5 text-[#00f0ff]" />

        <span className="text-sm font-semibold text-gray-300 uppercase tracking-widest">
          Check Contribution
        </span>
      </div>

      <p className="text-gray-400 text-sm mb-6">
        Enter a GitHub PR URL to check whether it has been registered
        in the DevTrust protocol.
      </p>

      <div className="flex gap-3">
        <input
          type="text"
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          placeholder="https://github.com/owner/repo/pull/123"
          className="flex-1 glass px-4 py-3 rounded-lg border border-white/20 focus:border-[#00f0ff]/50 focus:outline-none text-sm bg-transparent text-white placeholder-gray-500 transition-colors"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={
            status === "loading" || !prUrl.trim()
          }
          className="px-6 py-3 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background:
              "linear-gradient(135deg, #00f0ff, #8b5cf6)",
            color: "#000",
          }}
        >
          {status === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ExternalLink className="w-4 h-4" />
          )}

          Check
        </button>
      </div>

      {message && (
        <div
          className={`mt-4 px-4 py-3 rounded-lg text-sm ${
            status === "success"
              ? "bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981]"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Developer Gate                                                             */
/* -------------------------------------------------------------------------- */

function DeveloperGate({
  onRegister,
}: {
  onRegister: () => void;
}) {
  const { user } = useGitHubAuth();
  const { roles } = useUserRoles();

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="glass-strong rounded-2xl border border-white/10 p-12 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00f0ff]/20 to-[#8b5cf6]/20 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-gray-400" />
          </div>

          <h3
            className="text-2xl font-bold mb-2"
            style={{
              fontFamily: "var(--font-display)",
            }}
          >
            Login Required
          </h3>

          <p className="text-gray-400 mb-6">
            Sign in with GitHub to access the Developer dashboard.
          </p>

          <div className="flex items-center gap-2 justify-center text-sm text-yellow-400">
            <AlertCircle className="w-4 h-4" />
            Use the GitHub login button in the navbar
          </div>
        </div>
      </div>
    );
  }

  if (!roles.isDeveloper) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="glass-strong rounded-2xl border border-white/10 p-12 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00f0ff]/20 to-[#8b5cf6]/20 flex items-center justify-center mx-auto mb-4">
            <Code2 className="w-8 h-8 text-[#00f0ff]" />
          </div>

          <h3
            className="text-2xl font-bold mb-2"
            style={{
              fontFamily: "var(--font-display)",
            }}
          >
            Activate Developer Dashboard
          </h3>

          <p className="text-gray-400 mb-8">
            Activate the developer interface to view your
            on-chain DevTrust records.
          </p>

          <button
            onClick={onRegister}
            className="px-8 py-3 rounded-lg font-semibold transition-all hover:scale-105"
            style={{
              background:
                "linear-gradient(135deg, #00f0ff, #8b5cf6)",
              color: "#000",
            }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* PR Card                                                                    */
/* -------------------------------------------------------------------------- */

function PRCard({ pr }: { pr: DeveloperPR }) {
  const color = statusColor(pr.status);
  const name = statusName(pr.status);

  const challengeActive =
    pr.status === 2 &&
    pr.challengeDeadline > BigInt(Math.floor(Date.now() / 1000));

  return (
    <div className="p-6 hover:bg-white/[0.02] transition-all">
      <div className="flex items-start gap-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `${color}18`,
            border: `1px solid ${color}44`,
          }}
        >
          {pr.status === 5 ? (
            <CheckCircle
              className="w-5 h-5"
              style={{ color }}
            />
          ) : (
            <GitMerge
              className="w-5 h-5"
              style={{ color }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">
              PR #{pr.prNumber.toString()}
            </span>

            <span
              className="text-xs px-2.5 py-1 rounded-full"
              style={{
                color,
                background: `${color}15`,
                border: `1px solid ${color}35`,
              }}
            >
              {name}
            </span>
          </div>

          <div className="text-sm text-gray-400 mt-1">
            {pr.repository}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-xs text-gray-500">
            <span>
              Developer stake:{" "}
              <span className="text-gray-300">
                {formatEth(pr.developerStake)} ETH
              </span>
            </span>

            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {pr.reviewerCount.toString()} reviewer
              {pr.reviewerCount !== 1n ? "s" : ""}
            </span>

            <span>
              Reward pool:{" "}
              <span className="text-gray-300">
                {formatEth(pr.reviewerRewardPool)} ETH
              </span>
            </span>
          </div>
        </div>

        <a
          href={pr.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-[#00f0ff] transition-colors"
          title="Open GitHub PR"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      <div className="mt-5 ml-15 grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide">
            Created
          </div>

          <div className="text-xs text-gray-300 mt-1">
            {formatDate(pr.createdAt)}
          </div>
        </div>

        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide">
            Merged
          </div>

          <div className="text-xs text-gray-300 mt-1">
            {formatDate(pr.mergedAt)}
          </div>
        </div>
      </div>

      {pr.mergeCommit && (
        <div className="mt-3 ml-15 rounded-lg bg-white/[0.03] border border-white/5 p-3">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide">
            Verified merge commit
          </div>

          <div className="text-xs text-gray-300 font-mono mt-1 break-all">
            {pr.mergeCommit}
          </div>
        </div>
      )}

      {challengeActive && (
        <div className="mt-3 ml-15 flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-[#00f0ff]/5 border border-[#00f0ff]/15 text-cyan-300">
          <Clock className="w-3.5 h-3.5" />

          24-hour challenge period is active.
          Deadline: {formatDate(pr.challengeDeadline)}
        </div>
      )}

      {pr.settled && (
        <div className="mt-3 ml-15 flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-[#10b981]/5 border border-[#10b981]/15 text-emerald-300">
          <CheckCircle className="w-3.5 h-3.5" />

          This PR has been settled on-chain.
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SBT Card                                                                   */
/* -------------------------------------------------------------------------- */

function SBTCard({
  sbt,
}: {
  sbt: SBTInfo;
}) {
  return (
    <div className="glass-strong rounded-2xl border border-white/10 overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-[#00f0ff] to-[#8b5cf6]" />

      <div className="p-6">
        <div className="flex items-start justify-between mb-5">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#00f0ff]/20 to-[#8b5cf6]/20 flex items-center justify-center">
            <Award className="w-7 h-7 text-[#00f0ff]" />
          </div>

          <div className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-gray-500" />
            <span className="text-xs text-gray-500 font-mono">
              SOULBOUND
            </span>
          </div>
        </div>

        <h3
          className="font-bold text-lg"
          style={{
            fontFamily: "var(--font-display)",
          }}
        >
          DevTrust Proof of Skill
        </h3>

        <p className="text-sm text-gray-400 mt-1">
          Custom on-chain Proof-of-Skill credential
        </p>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
            <div className="text-[11px] text-gray-500">
              Token ID
            </div>

            <div className="text-sm text-white mt-1">
              #{sbt.tokenId.toString()}
            </div>
          </div>

          <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
            <div className="text-[11px] text-gray-500">
              Source PR
            </div>

            <div className="text-sm text-white mt-1">
              #{sbt.prId.toString()}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle className="w-3.5 h-3.5" />
          Recorded by the DevTrust contract
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Developer Page                                                             */
/* -------------------------------------------------------------------------- */

export function DeveloperPage() {
  const { roles, registerDeveloper } = useUserRoles();
  const { user } = useGitHubAuth();
  const { address, isConnected } = useAccount();

  const {
    prs,
    reputation,
    sbt,
    loading,
    error,
    refresh,
  } = useDeveloperChainData();

  const registeredPRCount = prs.length;

  const mergedPRCount = useMemo(
    () =>
      prs.filter(
        (pr) =>
          pr.status === 2 ||
          pr.status === 3 ||
          pr.status === 5
      ).length,
    [prs]
  );

  const gate = (
    <DeveloperGate onRegister={registerDeveloper} />
  );

  if (!user || !roles.isDeveloper) {
    return gate;
  }

  return (
    <div className="relative z-10 py-12 px-6 max-w-6xl mx-auto space-y-10">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full mb-4">
          <Sparkles className="w-4 h-4 text-[#00f0ff]" />

          <span
            className="text-sm"
            style={{
              fontFamily: "var(--font-mono)",
            }}
          >
            Developer Dashboard
          </span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              className="text-4xl font-bold mb-2"
              style={{
                fontFamily: "var(--font-display)",
              }}
            >
              Welcome back,{" "}
              <span className="gradient-text">
                @{user.login}
              </span>
            </h1>

            <p className="text-gray-400">
              Your on-chain reputation and DevTrust contribution history.
            </p>
          </div>

          <button
            onClick={refresh}
            disabled={loading}
            className="glass px-4 py-2 rounded-lg border border-white/10 hover:border-[#00f0ff]/40 transition-colors flex items-center gap-2 text-sm text-gray-300"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                loading ? "animate-spin" : ""
              }`}
            />

            Refresh
          </button>
        </div>
      </div>

      {/* Wallet */}
      <div className="glass-strong rounded-xl border border-white/10 p-4 flex flex-wrap items-center gap-3">
        <Wallet className="w-5 h-5 text-[#00f0ff]" />

        <span className="text-sm text-gray-400">
          Connected wallet
        </span>

        <span className="text-sm font-mono text-white">
          {isConnected
            ? formatAddress(address)
            : "Wallet not connected"}
        </span>

        {!isConnected && (
          <span className="text-xs text-yellow-400">
            Connect your wallet to read on-chain records.
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-3 text-sm text-red-300">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Top Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-strong rounded-xl p-5 border border-white/10 text-center">
          <div
            className="text-3xl font-bold gradient-text mb-1"
            style={{
              fontFamily: "var(--font-display)",
            }}
          >
            {reputation.toString()}
          </div>

          <div className="text-sm text-gray-400">
            On-chain Reputation
          </div>
        </div>

        <div className="glass-strong rounded-xl p-5 border border-white/10 text-center">
          <div
            className="text-3xl font-bold text-[#00f0ff] mb-1"
            style={{
              fontFamily: "var(--font-display)",
            }}
          >
            {registeredPRCount}
          </div>

          <div className="text-sm text-gray-400">
            Registered PRs
          </div>
        </div>

        <div className="glass-strong rounded-xl p-5 border border-white/10 text-center">
          <div
            className="text-3xl font-bold text-[#8b5cf6] mb-1"
            style={{
              fontFamily: "var(--font-display)",
            }}
          >
            {mergedPRCount}
          </div>

          <div className="text-sm text-gray-400">
            Merged PRs
          </div>
        </div>

        <div className="glass-strong rounded-xl p-5 border border-white/10 text-center">
          <div
            className="text-3xl font-bold mb-1"
            style={{
              fontFamily: "var(--font-display)",
              color: sbt.exists ? "#10b981" : "#6b7280",
            }}
          >
            {sbt.exists ? "1" : "0"}
          </div>

          <div className="text-sm text-gray-400">
            Proof-of-Skill SBT
          </div>
        </div>
      </div>

      {/* Reputation + Contribution check */}
      <div className="grid lg:grid-cols-2 gap-6">
        <DevTrustScoreCard
          reputation={reputation}
          verifiedPRs={registeredPRCount}
          sbtExists={sbt.exists}
        />

        <SubmitContribution />
      </div>

      {/* PR History */}
      <div>
        <div className="flex items-center gap-2 mb-6">
          <GitBranch className="w-5 h-5 text-[#00f0ff]" />

          <h2
            className="text-xl font-bold"
            style={{
              fontFamily: "var(--font-display)",
            }}
          >
            My DevTrust PRs
          </h2>
        </div>

        <div className="glass-strong rounded-2xl border border-white/10 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />

              Reading DevTrust records from Sepolia…
            </div>
          ) : prs.length === 0 ? (
            <div className="p-12 text-center">
              <GitBranch className="w-10 h-10 text-gray-600 mx-auto mb-4" />

              <h3
                className="text-lg font-semibold text-gray-300 mb-2"
              >
                No PR records found
              </h3>

              <p className="text-sm text-gray-500 max-w-md mx-auto">
                No DevTrust PR currently belongs to the connected
                wallet. Register a contribution and refresh this
                dashboard after the transaction is confirmed.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {prs.map((pr) => (
                <PRCard
                  key={pr.id.toString()}
                  pr={pr}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SBT */}
      <div>
        <div className="flex items-center gap-2 mb-6">
          <Award className="w-5 h-5 text-[#00f0ff]" />

          <h2
            className="text-xl font-bold"
            style={{
              fontFamily: "var(--font-display)",
            }}
          >
            Proof-of-Skill Credential
          </h2>
        </div>

        {sbt.exists ? (
          <SBTCard sbt={sbt} />
        ) : (
          <div className="glass-strong rounded-2xl border border-white/10 p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#00f0ff]/20 to-[#8b5cf6]/20 flex items-center justify-center mx-auto mb-4">
              <Award className="w-10 h-10 text-gray-400" />
            </div>

            <h3
              className="text-xl font-bold mb-2"
              style={{
                fontFamily: "var(--font-display)",
              }}
            >
              No Proof-of-Skill SBT yet
            </h3>

            <p className="text-gray-400 text-sm max-w-md mx-auto">
              An SBT is issued by the DevTrust contract when an
              eligible contribution is successfully settled.
            </p>
          </div>
        )}
      </div>

      {/* Architecture note */}
      <div className="rounded-xl border border-[#00f0ff]/10 bg-[#00f0ff]/[0.03] p-5">
        <div className="flex items-start gap-3">
          <CircleDollarSign className="w-5 h-5 text-[#00f0ff] mt-0.5" />

          <div>
            <h3 className="text-sm font-semibold text-gray-200">
              On-chain data source
            </h3>

            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Reputation, PR status, staking information and
              Proof-of-Skill credentials shown here are read from
              the deployed DevTrust v2 contract on Sepolia.
              GitHub authentication remains the interface-level
              identity gate.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}