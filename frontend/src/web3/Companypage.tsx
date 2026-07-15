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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
          Connect your wallet to post issue bounties, track resolutions, and manage your DevTrust company account.
        </p>
        <ConnectWalletButton variant="inline" className="mx-auto" />
        <p className="text-xs text-gray-500 mt-4">Uses Sepolia testnet</p>
      </div>
    </div>
  );
}

// ─── Main Company Page ────────────────────────────────────────────────────────

export function CompanyPage() {
  const { address, isConnected } = useAccount();
  const { user: githubUser } = useGitHubAuth();

  const [bounties, setBounties] = useState<BountyRecord[]>([]);
  const [showPostModal, setShowPostModal] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "solved" | "refunded">("all");

  const refresh = useCallback(() => {
    if (address) setBounties(loadBounties(address));
  }, [address]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!isConnected || !address) return <CompanyGate />;

  const filtered = bounties.filter((b) => {
    const matchSearch =
      !search.trim() ||
      b.issueTitle.toLowerCase().includes(search.toLowerCase()) ||
      b.repoName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || b.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="relative z-10 py-12 px-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <div
            className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full mb-4"
          >
            <Building2 className="w-4 h-4 text-[#00f0ff]" />
            <span className="text-sm" style={{ fontFamily: "var(--font-mono)" }}>
              Company Portal
            </span>
          </div>
          <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
            {githubUser ? (
              <>Welcome, <span className="gradient-text">@{githubUser.login}</span></>
            ) : (
              <span className="gradient-text">Issue Bounties</span>
            )}
          </h1>
          <p className="text-gray-400">
            Post ETH bounties on GitHub issues. DevTrust reviewers stake their reputation to verify solutions
            before they reach you — so only pre-audited PRs land in your inbox.
          </p>
        </div>
        <button
          onClick={() => setShowPostModal(true)}
          className="flex-shrink-0 flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 hover:scale-105"
          style={{ background: "linear-gradient(135deg, #00f0ff, #8b5cf6)", color: "#0a0a0f" }}
        >
          <Plus className="w-4 h-4" />
          Post Bounty
        </button>
      </div>

      {/* How It Works Banner */}
      <div
        className="rounded-2xl p-6 border"
        style={{ background: "rgba(0,240,255,0.03)", borderColor: "rgba(0,240,255,0.15)" }}
      >
        <h3 className="text-sm font-bold text-white mb-4" style={{ fontFamily: "var(--font-display)" }}>
          How DevTrust Bounties Work
        </h3>
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { step: "1", icon: Plus, label: "Post Bounty", desc: "Attach ETH to a GitHub issue. 80% goes to the dev, 20% to reviewers." },
            { step: "2", icon: GitBranch, label: "Dev Submits PR", desc: "A developer solves the issue and submits their branch via DevTrust." },
            { step: "3", icon: Shield, label: "Reviewers Stake & Vote", desc: "Expert reviewers stake ETH and vote on the solution's quality." },
            { step: "4", icon: CheckCircle, label: "You Merge & Pay", desc: "Merge the pre-vetted PR. ETH distributes automatically to dev + reviewers." },
          ].map((s) => (
            <div key={s.step} className="flex gap-3 items-start">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ background: "rgba(0,240,255,0.12)", border: "1px solid rgba(0,240,255,0.3)", color: "#00f0ff" }}
              >
                {s.step}
              </div>
              <div>
                <div className="text-xs font-semibold text-white mb-0.5">{s.label}</div>
                <div className="text-[11px] text-gray-500 leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <CompanyStatsBar address={address} />

      {/* Bounty List */}
      <div>
        {/* Toolbar */}
        <div className="flex items-center gap-4 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by issue title or repo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(0,240,255,0.4)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            />
          </div>
          <div className="flex items-center gap-2">
            {(["all", "active", "solved", "refunded"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
                style={{
                  background: filterStatus === s ? "rgba(0,240,255,0.12)" : "rgba(255,255,255,0.04)",
                  border: filterStatus === s ? "1px solid rgba(0,240,255,0.35)" : "1px solid rgba(255,255,255,0.08)",
                  color: filterStatus === s ? "#00f0ff" : "#9ca3af",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Empty state */}
        {bounties.length === 0 ? (
          <div
            className="glass-strong rounded-2xl border border-dashed p-16 text-center"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
          >
            <Coins className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2 text-white" style={{ fontFamily: "var(--font-display)" }}>
              No Bounties Yet
            </h3>
            <p className="text-gray-500 mb-6 text-sm">
              Post your first bounty to start receiving pre-vetted solutions from developers.
            </p>
            <button
              onClick={() => setShowPostModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #00f0ff, #8b5cf6)", color: "#0a0a0f" }}
            >
              <Plus className="w-4 h-4" />
              Post First Bounty
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            No bounties match your search.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((b) => (
              <BountyCard
                key={b.issueUrl}
                bounty={b}
                walletAddress={address}
                onRefresh={refresh}
              />
            ))}
          </div>
        )}
      </div>

      {/* Incoming PRs section — placeholder for Phase 3 */}
      <div
        className="glass-strong rounded-2xl border p-8"
        style={{ borderColor: "rgba(139,92,246,0.2)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)" }}
          >
            <GitBranch className="w-5 h-5 text-[#8b5cf6]" />
          </div>
          <div>
            <h3 className="font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
              Pre-Vetted PRs Inbox
            </h3>
            <p className="text-xs text-gray-500">
              PRs that passed reviewer staking gate — ready for your final review
            </p>
          </div>
          <span
            className="ml-auto text-xs px-3 py-1 rounded-full"
            style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", color: "#8b5cf6" }}
          >
            Phase 3
          </span>
        </div>
        <div className="text-center py-8">
          <TrendingUp className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            Coming in Phase 3 — the two-repo submission portal. Pre-vetted PRs will appear here
            automatically once reviewer staking threshold is met.
          </p>
        </div>
      </div>

      {/* Post Bounty Modal */}
      {showPostModal && (
        <PostBountyModal
          walletAddress={address}
          onClose={() => setShowPostModal(false)}
          onSuccess={() => {
            setShowPostModal(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

export default CompanyPage;