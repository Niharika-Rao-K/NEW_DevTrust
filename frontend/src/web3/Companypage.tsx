import { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseEther, formatEther } from "viem";
import { useGitHubAuth } from "./GitHubAuth";
import { ConnectWalletButton } from "./ConnectWalletButton";
import {
  Building2,
  Plus,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Loader2,
  Wallet,
  GitBranch,
  Search,
  ChevronRight,
  Coins,
  Clock,
  Shield,
  TrendingUp,
  Github,
  X,
  Info,
} from "lucide-react";

import {
  usePRBasic,
  usePRStaking,
  useTestingEligibility,
  usePRStatus,
} from "./hooks";

// ─── Contract config (V2 address — update after deploy) ──────────────────────

const CONTRACT_ADDRESS_V2 = (import.meta.env.VITE_CONTRACT_ADDRESS_V2 ||
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0xa28EC65D8D52fc77Bfbe553858312B9557EEc5Ad") as `0x${string}`;

const BOUNTY_ABI = [
  {
    inputs: [{ internalType: "string", name: "issueUrl", type: "string" }],
    name: "postBounty",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "string", name: "issueUrl", type: "string" }],
    name: "getBounty",
    outputs: [
      { internalType: "address", name: "company", type: "address" },
      { internalType: "uint256", name: "developerReward", type: "uint256" },
      { internalType: "uint256", name: "reviewerPool", type: "uint256" },
      { internalType: "bool", name: "claimed", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getTotalBounties",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "string", name: "issueUrl", type: "string" }],
    name: "refundBounty",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// ─── Local storage for company's posted bounties ──────────────────────────────

export interface BountyRecord {
  issueUrl: string;
  issueTitle: string;
  repoName: string;
  bountyEth: string;         // total ETH posted
  devRewardEth: string;      // 80%
  reviewerPoolEth: string;   // 20%
  txHash?: string;
  postedAt: string;          // ISO
  status: "active" | "solved" | "refunded";
  solvedPrUrl?: string;
}

function bountyKey(address: string) {
  return `devtrust_company_bounties_${address.toLowerCase()}`;
}

function loadBounties(address: string): BountyRecord[] {
  try {
    const raw = localStorage.getItem(bountyKey(address));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveBounty(address: string, record: BountyRecord) {
  try {
    const existing = loadBounties(address);
    const filtered = existing.filter((r) => r.issueUrl !== record.issueUrl);
    localStorage.setItem(bountyKey(address), JSON.stringify([record, ...filtered]));
  } catch {}
}

function updateBountyStatus(address: string, issueUrl: string, update: Partial<BountyRecord>) {
  try {
    const existing = loadBounties(address);
    const updated = existing.map((r) => r.issueUrl === issueUrl ? { ...r, ...update } : r);
    localStorage.setItem(bountyKey(address), JSON.stringify(updated));
  } catch {}
}

// ─── Helpers //─────────────────────────────────────────────────────────────────

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={`https://sepolia.etherscan.io/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-xs text-[#00f0ff] hover:underline mt-1"
    >
      <ExternalLink className="w-3 h-3" />
      View on Etherscan
    </a>
  );
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function parseIssueUrl(url: string): { owner: string; repo: string; number: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: m[3] };
}

// ─── Post Bounty Modal ────────────────────────────────────────────────────────

function PostBountyModal({
  onClose,
  walletAddress,
  onSuccess,
}: {
  onClose: () => void;
  walletAddress: string;
  onSuccess: () => void;
}) {
  const [issueUrl, setIssueUrl] = useState("");
  const [issueTitle, setIssueTitle] = useState("");
  const [bountyEth, setBountyEth] = useState("0.01");
  const [urlError, setUrlError] = useState("");
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const isLoading = isPending || isConfirming;

  // Auto-fetch issue title from GitHub API when URL changes
  useEffect(() => {
    const parsed = parseIssueUrl(issueUrl.trim());
    if (!parsed) {
      if (issueUrl.trim()) setUrlError("Must be a GitHub issue URL: github.com/owner/repo/issues/123");
      else setUrlError("");
      setIssueTitle("");
      return;
    }
    setUrlError("");
    setIsFetchingTitle(true);
    fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.title) setIssueTitle(data.title);
        else setIssueTitle(`Issue #${parsed.number}`);
      })
      .catch(() => setIssueTitle(`Issue #${parsed.number}`))
      .finally(() => setIsFetchingTitle(false));
  }, [issueUrl]);

  useEffect(() => {
    if (isSuccess && hash) {
      const parsed = parseIssueUrl(issueUrl.trim());
      const repoName = parsed ? `${parsed.owner}/${parsed.repo}` : issueUrl;
      const total = parseFloat(bountyEth);
      const devReward = (total * 0.8).toFixed(5);
      const reviewerPool = (total * 0.2).toFixed(5);
      saveBounty(walletAddress, {
        issueUrl: issueUrl.trim(),
        issueTitle: issueTitle || `Issue`,
        repoName,
        bountyEth,
        devRewardEth: devReward,
        reviewerPoolEth: reviewerPool,
        txHash: hash,
        postedAt: new Date().toISOString(),
        status: "active",
      });
      onSuccess();
    }
  }, [isSuccess]);

  const handlePost = () => {
    const trimmed = issueUrl.trim();
    if (!parseIssueUrl(trimmed)) {
      setUrlError("Invalid issue URL");
      return;
    }
    const eth = parseFloat(bountyEth);
    if (isNaN(eth) || eth < 0.005) {
      setUrlError("Minimum bounty is 0.005 ETH");
      return;
    }
    writeContract({
      address: CONTRACT_ADDRESS_V2,
      abi: BOUNTY_ABI,
      functionName: "postBounty",
      args: [trimmed],
      value: parseEther(bountyEth),
    });
  };

  const devReward = (parseFloat(bountyEth || "0") * 0.8).toFixed(4);
  const reviewerPool = (parseFloat(bountyEth || "0") * 0.2).toFixed(4);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="glass-strong rounded-2xl p-8 border w-full max-w-lg"
        style={{ borderColor: "rgba(0,240,255,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(0,240,255,0.1)", border: "1px solid rgba(0,240,255,0.3)" }}
            >
              <Plus className="w-5 h-5 text-[#00f0ff]" />
            </div>
            <div>
              <h3 className="font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
                Post a Bounty
              </h3>
              <p className="text-xs text-gray-500">Attach ETH reward to a GitHub issue</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Issue URL */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">GitHub Issue URL</label>
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={issueUrl}
                onChange={(e) => setIssueUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/issues/42"
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: urlError
                    ? "1px solid rgba(239,68,68,0.5)"
                    : "1px solid rgba(255,255,255,0.1)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(0,240,255,0.4)")}
                onBlur={(e) => (e.target.style.borderColor = urlError ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)")}
              />
            </div>
            {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
            {isFetchingTitle && (
              <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                <Loader2 className="w-3 h-3 animate-spin" /> Fetching issue…
              </div>
            )}
            {issueTitle && !urlError && (
              <div
                className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg text-xs"
                style={{ background: "rgba(0,240,255,0.06)", border: "1px solid rgba(0,240,255,0.2)" }}
              >
                <GitBranch className="w-3 h-3 text-[#00f0ff] flex-shrink-0" />
                <span className="text-gray-300 truncate">{issueTitle}</span>
              </div>
            )}
          </div>

          {/* Bounty Amount */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Bounty Amount (ETH)</label>
            <input
              type="number"
              value={bountyEth}
              min="0.005"
              step="0.001"
              onChange={(e) => setBountyEth(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm text-white focus:outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,240,255,0.3)" }}
            />
            <p className="text-[10px] text-gray-500 mt-1">Minimum: 0.005 ETH on Sepolia testnet</p>
          </div>

          {/* Split preview */}
          <div
            className="rounded-xl p-4 space-y-2"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs text-gray-400 font-medium">Bounty Distribution</span>
            </div>
            {[
              { label: "Developer Reward (80%)", value: `${devReward} ETH`, color: "#10b981" },
              { label: "Reviewer Bonus Pool (20%)", value: `${reviewerPool} ETH`, color: "#8b5cf6" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center text-xs">
                <span className="text-gray-500">{row.label}</span>
                <span className="font-bold font-mono" style={{ color: row.color }}>{row.value}</span>
              </div>
            ))}
            <div
              className="pt-2 mt-2 border-t border-white/10 flex justify-between text-xs"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}
            >
              <span className="text-gray-400">Total locked on-chain</span>
              <span className="font-bold font-mono text-[#00f0ff]">{bountyEth} ETH</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-2 px-4 py-3 rounded-xl text-xs"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-red-300">{(error as Error).message?.slice(0, 150)}</span>
            </div>
          )}

          {/* Success */}
          {isSuccess && hash && (
            <div
              className="px-4 py-3 rounded-xl text-xs"
              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}
            >
              <p className="text-[#10b981] font-medium">✓ Bounty posted on-chain!</p>
              <TxLink hash={hash} />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400 transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {isSuccess ? "Close" : "Cancel"}
            </button>
            {!isSuccess && (
              <button
                onClick={handlePost}
                disabled={isLoading || !!urlError || !issueUrl.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #00f0ff, #8b5cf6)", color: "#0a0a0f" }}
              >
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{isConfirming ? "Confirming…" : "Waiting…"}</>
                ) : (
                  <><Coins className="w-4 h-4" />Post Bounty</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bounty Card ──────────────────────────────────────────────────────────────

function BountyCard({ bounty, walletAddress, onRefresh }: {
  bounty: BountyRecord;
  walletAddress: string;
  onRefresh: () => void;
}) {
  const [isRefunding, setIsRefunding] = useState(false);

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isSuccess: refundSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (refundSuccess) {
      updateBountyStatus(walletAddress, bounty.issueUrl, { status: "refunded" });
      onRefresh();
    }
  }, [refundSuccess]);

  const statusColors: Record<string, { color: string; bg: string; border: string }> = {
    active:   { color: "#00f0ff", bg: "rgba(0,240,255,0.08)",   border: "rgba(0,240,255,0.25)" },
    solved:   { color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.25)" },
    refunded: { color: "#6b7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.2)" },
  };

  const sc = statusColors[bounty.status];
  const parsed = parseIssueUrl(bounty.issueUrl);

  return (
    <div
      className="glass-strong rounded-2xl border p-6 flex flex-col gap-4 transition-all hover:border-white/20"
      style={{ borderColor: "rgba(255,255,255,0.08)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-[10px] text-gray-500 font-mono truncate">{bounty.repoName}</span>
          </div>
          <h4
            className="text-sm font-bold text-white line-clamp-2 leading-snug"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {bounty.issueTitle}
          </h4>
        </div>
        <span
          className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0"
          style={{ color: sc.color, background: sc.bg, border: `1px solid ${sc.border}` }}
        >
          {bounty.status === "active" ? "● Open" : bounty.status === "solved" ? "✓ Solved" : "Refunded"}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {[
          { label: "Total Bounty", value: `${bounty.bountyEth} ETH`, color: "#00f0ff" },
          { label: "Dev Reward", value: `${bounty.devRewardEth} ETH`, color: "#10b981" },
          { label: "Reviewer Pool", value: `${bounty.reviewerPoolEth} ETH`, color: "#8b5cf6" },
        ].map((s) => (
          <div
            key={s.label}
            className="px-2 py-2 rounded-lg"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[9px] text-gray-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          {timeAgo(bounty.postedAt)}
        </div>
        <div className="flex items-center gap-2">
          {bounty.txHash && <TxLink hash={bounty.txHash} />}
          <a
            href={bounty.issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#00f0ff] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {parsed ? `#${parsed.number}` : "View"}
          </a>
        </div>
      </div>

      {/* Refund button for active bounties */}
      {bounty.status === "active" && (
        <button
          onClick={() => {
            if (!confirm("Refund this bounty? The ETH will be returned to your wallet.")) return;
            writeContract({
              address: CONTRACT_ADDRESS_V2,
              abi: BOUNTY_ABI,
              functionName: "refundBounty",
              args: [bounty.issueUrl],
            });
          }}
          disabled={isPending}
          className="w-full py-2 rounded-xl text-xs font-medium transition-all hover:bg-red-500/10 disabled:opacity-50"
          style={{ color: "#9ca3af", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          {isPending ? "Processing…" : "Refund Bounty"}
        </button>
      )}

      {error && (
        <p className="text-xs text-red-400">{(error as Error).message?.slice(0, 100)}</p>
      )}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function CompanyStatsBar({ address }: { address: string }) {
  const bounties = loadBounties(address);
  const active = bounties.filter((b) => b.status === "active").length;
  const solved = bounties.filter((b) => b.status === "solved").length;
  const totalEth = bounties.reduce((s, b) => s + parseFloat(b.bountyEth || "0"), 0);

  const { data: onChainTotal } = useReadContract({
    address: CONTRACT_ADDRESS_V2,
    abi: BOUNTY_ABI,
    functionName: "getTotalBounties",
  });

  return (
    <div className="grid grid-cols-4 gap-4 mb-8">
      {[
        { label: "Active Bounties", value: active, color: "#00f0ff" },
        { label: "Solved Issues", value: solved, color: "#10b981" },
        { label: "ETH Posted", value: `${totalEth.toFixed(4)}`, color: "#8b5cf6" },
        { label: "On-Chain Bounties", value: onChainTotal?.toString() ?? "…", color: "#f92b88" },
      ].map((s) => (
        <div key={s.label} className="glass rounded-xl px-4 py-3 text-center">
          <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
          <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Company Gate (not connected) ─────────────────────────────────────────────

function CompanyGate() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="glass-strong rounded-2xl border border-white/10 p-12 text-center max-w-md">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: "linear-gradient(135deg, rgba(0,240,255,0.2), rgba(139,92,246,0.2))" }}
        >
          <Building2 className="w-8 h-8 text-[#00f0ff]" />
        </div>
        <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
          Company Portal
        </h3>
        <p className="text-gray-400 mb-8 leading-relaxed">
          Connect your wallet to review contributions that have reached the company-defined reviewer-stake threshold and manage the testing and verification lifecycle.
        </p>
        <ConnectWalletButton variant="inline" className="mx-auto" />
        <p className="text-xs text-gray-500 mt-4">DevTrust v3 · Sepolia testnet
</p>
      </div>
    </div>
  );
}

// ─── Main Company Page 
// ─── DevTrust v3: Company Testing Inbox ─────────────────────────────────────

function V3CompanyTestingInbox() {
  const DEMO_PR_ID = 1n;

  const { address } = useAccount();

  const {
    data: prBasic,
    isLoading: isBasicLoading,
  } = usePRBasic(DEMO_PR_ID);

  const {
    data: prStaking,
    isLoading: isStakingLoading,
  } = usePRStaking(DEMO_PR_ID);

  const {
    data: eligibility,
    isLoading: isEligibilityLoading,
  } = useTestingEligibility(DEMO_PR_ID);

  const {
    data: prStatus,
  } = usePRStatus(DEMO_PR_ID);

  const repository = prBasic?.[1] as string | undefined;
  const prNumber = prBasic?.[2] as bigint | undefined;
  const prUrl = prBasic?.[3] as string | undefined;
  const developer = prBasic?.[4] as string | undefined;
  const company = prBasic?.[5] as string | undefined;

  const developerStake = prStaking?.[0] as bigint | undefined;
  const reviewerRewardPool = prStaking?.[1] as bigint | undefined;
  const totalReviewerStake = prStaking?.[2] as bigint | undefined;
  const reviewerCount = prStaking?.[3] as bigint | undefined;

  const reviewerThreshold = eligibility?.[1] as bigint | undefined;
  const testingEligible = eligibility?.[2] as boolean | undefined;

  const status = prStatus?.[0] as bigint | undefined;
  const challengeDeadline = prStatus?.[3] as bigint | undefined;

  const isLoading =
    isBasicLoading ||
    isStakingLoading ||
    isEligibilityLoading;

  // DevTrust v3 enum:
  // 0 = NONE
  // 1 = OPEN
  // 2 = MERGED
  // 3 = APPROVED
  // 4 = REJECTED
  // 5 = SETTLED

  const statusNumber = status !== undefined ? Number(status) : undefined;

  const statusLabel =
    statusNumber === 1
      ? "Open"
      : statusNumber === 2
        ? "Merged"
        : statusNumber === 3
          ? "Approved"
          : statusNumber === 4
            ? "Rejected"
            : statusNumber === 5
              ? "Settled"
              : "Loading";

  const isCompany =
    address &&
    company &&
    address.toLowerCase() === company.toLowerCase();

  return (
    <div
      className="glass-strong rounded-2xl border p-8"
      style={{ borderColor: "rgba(139,92,246,0.25)" }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: "rgba(139,92,246,0.1)",
            border: "1px solid rgba(139,92,246,0.3)",
          }}
        >
          <GitBranch className="w-5 h-5 text-[#8b5cf6]" />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3
              className="font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Company Testing Inbox
            </h3>

            <span
              className="text-[9px] px-2 py-1 rounded-full font-bold tracking-wider"
              style={{
                background: "rgba(0,240,255,0.1)",
                border: "1px solid rgba(0,240,255,0.25)",
                color: "#00f0ff",
              }}
            >
              V3 · LIVE
            </span>
          </div>

          <p className="text-xs text-gray-500 mt-1">
            Contributions that reached the company-defined reviewer-stake
            threshold.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-sm text-gray-500 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Reading DevTrust v3 from Sepolia…
        </div>
      ) : (
        <>
          {/* PR identity */}
          <div
            className="rounded-xl p-5 mb-4"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                  GitHub Pull Request
                </div>

                <div className="text-base font-bold text-white truncate">
                  {repository || "Unknown repository"}
                </div>

                {prNumber !== undefined && (
                  <div className="text-sm text-[#00f0ff] mt-1">
                    PR #{prNumber.toString()}
                  </div>
                )}

                {prUrl && (
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#00f0ff] mt-2"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View GitHub PR
                  </a>
                )}
              </div>

              <span
                className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-semibold"
                style={{
                  color:
                    testingEligible
                      ? "#10b981"
                      : "#9ca3af",
                  background:
                    testingEligible
                      ? "rgba(16,185,129,0.1)"
                      : "rgba(255,255,255,0.04)",
                  border:
                    testingEligible
                      ? "1px solid rgba(16,185,129,0.25)"
                      : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {testingEligible
                  ? "✓ Testing Eligible"
                  : "Waiting for Threshold"}
              </span>
            </div>
          </div>

          {/* Threshold */}
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            <div
              className="rounded-xl p-4"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                Reviewer Stake
              </div>

              <div className="text-lg font-bold text-white font-mono mt-1">
                {totalReviewerStake !== undefined
                  ? formatEther(totalReviewerStake)
                  : "0"}{" "}
                ETH
              </div>

              <div className="text-[10px] text-gray-600 mt-1">
                Current total
              </div>
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                Required Threshold
              </div>

              <div className="text-lg font-bold text-white font-mono mt-1">
                {reviewerThreshold !== undefined
                  ? formatEther(reviewerThreshold)
                  : "0"}{" "}
                ETH
              </div>

              <div className="text-[10px] text-gray-600 mt-1">
                Company-defined minimum
              </div>
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                Reviewers
              </div>

              <div className="text-lg font-bold text-white font-mono mt-1">
                {reviewerCount?.toString() ?? "0"}
              </div>

              <div className="text-[10px] text-gray-600 mt-1">
                Reviewer(s) participating
              </div>
            </div>
          </div>

          {/* Testing gate */}
          <div
            className="rounded-xl p-5 mb-5"
            style={{
              background: testingEligible
                ? "rgba(16,185,129,0.06)"
                : "rgba(251,191,36,0.05)",
              border: testingEligible
                ? "1px solid rgba(16,185,129,0.22)"
                : "1px solid rgba(251,191,36,0.18)",
            }}
          >
            <div className="flex items-start gap-3">
              {testingEligible ? (
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
              )}

              <div>
                <div className="text-sm font-semibold text-white">
                  {testingEligible
                    ? "Contribution is eligible for company testing"
                    : "Contribution is not yet eligible for company testing"}
                </div>

                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  {testingEligible
                    ? "The reviewer-backed stake has reached the minimum threshold specified by the company. The company can now test the contribution off-chain."
                    : "The contribution remains in the reviewer staking stage until the company-defined minimum reviewer stake is reached."}
                </p>
              </div>
            </div>
          </div>

          {/* Lifecycle */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="text-xs font-semibold text-white mb-4">
              DevTrust v3 lifecycle
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-green-400">✓</span>
                <span className="text-gray-300">
                  Developer registers contribution
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={
                    testingEligible
                      ? "text-green-400"
                      : "text-yellow-400"
                  }
                >
                  {testingEligible ? "✓" : "●"}
                </span>
                <span className="text-gray-300">
                  Reviewer stake reaches company threshold
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={
                    testingEligible
                      ? "text-green-400"
                      : "text-gray-600"
                  }
                >
                  {testingEligible ? "✓" : "○"}
                </span>
                <span className="text-gray-300">
                  Company testing
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={
                    statusNumber !== undefined && statusNumber >= 2
                      ? "text-green-400"
                      : "text-gray-600"
                  }
                >
                  {statusNumber !== undefined && statusNumber >= 2
                    ? "✓"
                    : "○"}
                </span>
                <span className="text-gray-300">
                  GitHub merge verified by oracle
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={
                    statusNumber !== undefined && statusNumber >= 2
                      ? "text-green-400"
                      : "text-gray-600"
                  }
                >
                  {statusNumber !== undefined && statusNumber >= 2
                    ? "✓"
                    : "○"}
                </span>

                <span className="text-gray-300">
                  Challenge period
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={
                    statusNumber !== undefined && statusNumber >= 3
                      ? "text-green-400"
                      : "text-gray-600"
                  }
                >
                  {statusNumber !== undefined && statusNumber >= 3
                    ? "✓"
                    : "○"}
                </span>

                <span className="text-gray-300">
                  Company approval / rejection
                </span>
              </div>
            </div>

            {/* Current contract state */}
            <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-gray-500">
              <span>
                Contract status:{" "}
                <span className="text-gray-300">
                  {statusLabel}
                </span>
              </span>

              <span>
                Developer stake:{" "}
                <span className="text-gray-300">
                  {developerStake !== undefined
                    ? formatEther(developerStake)
                    : "0"}{" "}
                  ETH
                </span>
              </span>

              <span>
                Reviewer pool:{" "}
                <span className="text-gray-300">
                  {reviewerRewardPool !== undefined
                    ? formatEther(reviewerRewardPool)
                    : "0"}{" "}
                  ETH
                </span>
              </span>
            </div>

            {challengeDeadline !== undefined &&
              challengeDeadline > 0n && (
                <div className="mt-3 text-[10px] text-gray-500">
                  Challenge deadline recorded on-chain:{" "}
                  <span className="text-gray-300">
                    {new Date(
                      Number(challengeDeadline) * 1000
                    ).toLocaleString()}
                  </span>
                </div>
              )}
          </div>

          {/* Wallet information */}
          <div className="mt-4 text-[10px] text-gray-600">
            Connected wallet:{" "}
            {address
              ? `${address.slice(0, 8)}...${address.slice(-6)}`
              : "Not connected"}
            {" · "}
            Company wallet:{" "}
            {company
              ? `${company.slice(0, 8)}...${company.slice(-6)}`
              : "—"}
            {isCompany && (
              <span className="text-green-500 ml-2">
                ✓ Company wallet
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
//────────────────────────────────────────────────────────
export function CompanyPage() {
  const { address, isConnected } = useAccount();
  const { user: githubUser } = useGitHubAuth();

  if (!isConnected || !address) {
    return <CompanyGate />;
  }

  return (
    <div className="relative z-10 py-12 px-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full mb-4">
            <Building2 className="w-4 h-4 text-[#00f0ff]" />
            <span
              className="text-sm"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Company Portal
            </span>
          </div>

          <h1
            className="text-4xl font-bold mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {githubUser ? (
              <>
                Welcome,{" "}
                <span className="gradient-text">
                  @{githubUser.login}
                </span>
              </>
            ) : (
              <span className="gradient-text">
                Company Testing Portal
              </span>
            )}
          </h1>

          <p className="text-gray-400 max-w-3xl leading-relaxed">
            Review GitHub contributions after they receive sufficient
            reviewer-backed stake. A contribution becomes eligible for
            company testing when the company-defined reviewer-stake
            threshold is reached.
          </p>
        </div>
      </div>

      {/* How DevTrust v3 Works */}
      <div
        className="rounded-2xl p-6 border"
        style={{
          background: "rgba(0,240,255,0.03)",
          borderColor: "rgba(0,240,255,0.15)",
        }}
      >
        <div className="flex items-center gap-2 mb-5">
          <Shield className="w-4 h-4 text-[#00f0ff]" />

          <h3
            className="text-sm font-bold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            How DevTrust v3 Works
          </h3>

          <span
            className="text-[9px] px-2 py-1 rounded-full font-bold tracking-wider"
            style={{
              background: "rgba(0,240,255,0.1)",
              border: "1px solid rgba(0,240,255,0.25)",
              color: "#00f0ff",
            }}
          >
            LIVE ON SEPOLIA
          </span>
        </div>

        <div className="grid md:grid-cols-4 gap-5">
          {[
            {
              step: "1",
              icon: Plus,
              label: "Contribution Registered",
              desc: "A developer registers a GitHub pull request and deposits the required developer stake.",
            },
            {
              step: "2",
              icon: Shield,
              label: "Reviewer Staking",
              desc: "Reviewers stake ETH and vote on the contribution.",
            },
            {
              step: "3",
              icon: CheckCircle,
              label: "Testing Eligibility",
              desc: "The contribution becomes eligible for company testing once the required total reviewer stake is reached.",
            },
            {
              step: "4",
              icon: GitBranch,
              label: "Merge Verification",
              desc: "After testing, the GitHub merge is verified by the oracle before the challenge period begins.",
            },
          ].map((s) => {
            const Icon = s.icon;

            return (
              <div
                key={s.step}
                className="flex gap-3 items-start"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{
                    background: "rgba(0,240,255,0.12)",
                    border: "1px solid rgba(0,240,255,0.3)",
                    color: "#00f0ff",
                  }}
                >
                  {s.step}
                </div>

                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-1">
                    <Icon className="w-3.5 h-3.5 text-[#00f0ff]" />
                    {s.label}
                  </div>

                  <div className="text-[11px] text-gray-500 leading-relaxed">
                    {s.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live V3 Company Inbox */}
      <V3CompanyTestingInbox />

      {/* Company wallet */}
      <div
        className="glass rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-3"
        style={{
          border: "1px solid rgba(139,92,246,0.2)",
        }}
      >
        <div className="flex items-center gap-3">
          <Wallet className="w-4 h-4 text-[#8b5cf6]" />

          <div>
            <div className="text-xs text-gray-500">
              Connected Company Wallet
            </div>

            <div className="text-sm text-white font-mono">
              {address.slice(0, 8)}...
              {address.slice(-6)}
            </div>
          </div>
        </div>

        <div className="text-[10px] text-gray-600">
          Sepolia testnet · DevTrust v3
        </div>
      </div>
    </div>
  );
}

export default CompanyPage;
