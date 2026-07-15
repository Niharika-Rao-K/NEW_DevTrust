import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  CheckCircle,
  AlertCircle,
  Loader2,
  GitBranch,
  ExternalLink,
  Code2,
  Users,
  Search,
  Plus,
  Award,
  Activity,
  Eye,
  Layers,
  ChevronRight,
  TrendingUp,
  Clock,
} from "lucide-react";
import { useStake, useStakeCustomAmount, useIsStaked, useStakeAmount, useTotalRecords } from "./hooks";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { ContributionFeed } from "./ContributionFeed";
import { BACKEND_URL, MIN_STAKE_ETH } from "./constants";
import { GitHubAuthGate, useGitHubAuth } from "./GitHubAuth";
import { useUserRoles } from "./UserRolesContext";

// ─── Reviewer Stake Storage Helpers ──────────────────────────────────────────

export interface StakeRecord {
  projectName: string;
  projectId: string;
  amount: string; // ETH as string
  type: "project" | "manual";
  url?: string; // for manual entries
  stakedAt: string; // ISO
}

function stakeKey(githubId: string) {
  return `devtrust_reviewer_stakes_${githubId}`;
}

function loadStakes(githubId: string): StakeRecord[] {
  try {
    const raw = sessionStorage.getItem(stakeKey(githubId));
    return raw ? (JSON.parse(raw) as StakeRecord[]) : [];
  } catch {
    return [];
  }
}

function saveStake(githubId: string, record: StakeRecord) {
  try {
    const existing = loadStakes(githubId);
    // Prevent duplicates: for manual entries, ignore if same URL was saved within 10s
    if (record.type === "manual") {
      const recent = existing.find(
        (r) => r.url === record.url && Date.now() - new Date(r.stakedAt).getTime() < 10000
      );
      if (recent) return;
    }
    sessionStorage.setItem(stakeKey(githubId), JSON.stringify([record, ...existing]));
  } catch {}
}

// ─── Shared PR Registry ───────────────────────────────────────────────────────
// Resolution: majority vote among staked reviewers (Approve / Reject)
// Threshold: total ETH staked on PR >= 0.01 ETH
// Reward: if Approved → reviewers get stake back + 10% bonus from dev stake pool

export const ETH_THRESHOLD = 0.01;   // minimum total ETH for a PR to be eligible
export const BONUS_PERCENT  = 10;     // % bonus reviewers earn on approval
const REGISTRY_KEY = "devtrust_pr_registry";

export interface ReviewerStake {
  githubId: string;
  githubLogin: string;
  amount: string;   // ETH
  stakedAt: string; // ISO
  vote?: "approve" | "reject"; // cast after staking
}

export interface PREntry {
  prUrl: string;
  reviewerStakes: ReviewerStake[];
  // voting outcome
  resolved: boolean;
  outcome?: "approved" | "rejected";
  resolvedAt?: string;
  // ETH accounting
  totalEthStaked: number;
  thresholdMet: boolean;
}

export function loadRegistry(): Record<string, PREntry> {
  try {
    const raw = sessionStorage.getItem(REGISTRY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveRegistry(reg: Record<string, PREntry>) {
  try { sessionStorage.setItem(REGISTRY_KEY, JSON.stringify(reg)); } catch {}
}

function tally(entry: PREntry): { approves: number; rejects: number; total: number } {
  const voters = entry.reviewerStakes.filter((s) => s.vote);
  const approves = voters.filter((s) => s.vote === "approve").length;
  const rejects  = voters.filter((s) => s.vote === "reject").length;
  return { approves, rejects, total: voters.length };
}

/** Add a reviewer stake to a PR entry */
export function addReviewerStakeToRegistry(
  prUrl: string,
  reviewer: { githubId: string; githubLogin: string; amount: string }
) {
  try {
    const reg = loadRegistry();
    const entry: PREntry = reg[prUrl] ?? {
      prUrl, reviewerStakes: [], resolved: false,
      totalEthStaked: 0, thresholdMet: false,
    };
    if (entry.reviewerStakes.some((s) => s.githubId === reviewer.githubId)) return;
    entry.reviewerStakes.push({ ...reviewer, stakedAt: new Date().toISOString() });
    entry.totalEthStaked = entry.reviewerStakes.reduce((s, r) => s + parseFloat(r.amount || "0"), 0);
    entry.thresholdMet   = entry.totalEthStaked >= ETH_THRESHOLD;
    reg[prUrl] = entry;
    saveRegistry(reg);
  } catch {}
}

/** Cast a vote for a reviewer on a PR */
export function castVote(prUrl: string, githubId: string, vote: "approve" | "reject") {
  try {
    const reg = loadRegistry();
    const entry = reg[prUrl];
    if (!entry) return;
    const stake = entry.reviewerStakes.find((s) => s.githubId === githubId);
    if (!stake || !entry.thresholdMet) return; // can only vote after threshold met
    stake.vote = vote;
    // resolve when every staked reviewer has voted
    const { approves, rejects, total } = tally(entry);
    if (!entry.resolved && total === entry.reviewerStakes.length && total > 0) {
      entry.resolved  = true;
      entry.outcome   = approves > rejects ? "approved" : "rejected";
      entry.resolvedAt = new Date().toISOString();
    }
    reg[prUrl] = entry;
    saveRegistry(reg);
  } catch {}
}

/** Bonus ETH a reviewer earns on approval */
export function reviewerBonus(stakeAmount: string): string {
  return ((parseFloat(stakeAmount) * BONUS_PERCENT) / 100).toFixed(4);
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

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

function StatsBar() {
  const { data: totalRecords } = useTotalRecords();
  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      {[
        { label: "Your Network", value: "Sepolia Testnet", color: "#00f0ff" },
        { label: "Total Verifications", value: totalRecords?.toString() ?? "…", color: "#8b5cf6" },
        { label: "Min Stake", value: `${MIN_STAKE_ETH} ETH`, color: "#10b981" },
      ].map((s) => (
        <div key={s.label} className="glass rounded-xl px-4 py-3 text-center">
          <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
          <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Role Selector ────────────────────────────────────────────────────────────

function RoleSelector({
  activeRole,
  onSelect,
}: {
  activeRole: "developer" | "reviewer";
  onSelect: (r: "developer" | "reviewer") => void;
}) {
  return (
    <div className="flex gap-3 mb-10">
      {([
        { id: "developer", label: "Developer", icon: Code2, desc: "Submit PRs & track your trust score" },
        { id: "reviewer", label: "Reviewer", icon: Users, desc: "Browse & stake on projects" },
      ] as const).map(({ id, label, icon: Icon, desc }) => {
        const active = activeRole === id;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className="flex-1 flex items-center gap-4 px-6 py-5 rounded-2xl text-left transition-all"
            style={{
              background: active
                ? "linear-gradient(135deg, rgba(0,240,255,0.12), rgba(139,92,246,0.12))"
                : "rgba(255,255,255,0.03)",
              border: active
                ? "1px solid rgba(0,240,255,0.4)"
                : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: active ? "rgba(0,240,255,0.1)" : "rgba(255,255,255,0.05)",
                border: active ? "1px solid rgba(0,240,255,0.3)" : "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Icon className="w-5 h-5" style={{ color: active ? "#00f0ff" : "#6b7280" }} />
            </div>
            <div>
              <div
                className="font-bold text-sm mb-0.5"
                style={{ fontFamily: "var(--font-display)", color: active ? "#fff" : "#9ca3af" }}
              >
                {label}
              </div>
              <div className="text-xs text-gray-500">{desc}</div>
            </div>
            {active && <ChevronRight className="w-4 h-4 text-[#00f0ff] ml-auto" />}
          </button>
        );
      })}
    </div>
  );
}

// ─── DEVELOPER PAGE ───────────────────────────────────────────────────────────

function DevTrustScoreCard() {
  const { address, isConnected } = useAccount();
  const { data: isStaked } = useIsStaked();
  const { data: totalRecords } = useTotalRecords();
  const { roles } = useUserRoles();

  const verifiedPRs = Number(totalRecords ?? 0);
  const sbtBonus = roles.sbtCount * 5;
  const stakedBonus = isStaked ? 10 : 0;
  const score = isConnected
    ? Math.min(100, verifiedPRs * 15 + sbtBonus + stakedBonus)
    : 0;
    
  return (
    <div
      className="glass-strong rounded-2xl p-7 border"
      style={{ borderColor: "rgba(0,240,255,0.2)" }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(0,240,255,0.1)", border: "1px solid rgba(0,240,255,0.3)" }}
        >
          <Award className="w-5 h-5 text-[#00f0ff]" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Trust Score & SBT
          </h3>
          <p className="text-xs text-gray-500">Your on-chain reputation</p>
        </div>
      </div>

      {!isConnected ? (
        <div className="text-center py-6">
          <ConnectWalletButton variant="inline" className="mx-auto" />
          <p className="text-xs text-gray-500 mt-3">Connect wallet to view your score</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-6 mb-5">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                <circle
                  cx="40" cy="40" r="32" fill="none"
                  stroke="url(#scoreGrad)" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 201} 201`}
                />
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#00f0ff" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>
                  {score}
                </span>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isStaked ? "bg-[#10b981]" : "bg-gray-600"}`} />
                <span className={isStaked ? "text-[#10b981]" : "text-gray-500"}>
                  {isStaked ? "Staked & Active" : "Not Staked"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${Number(totalRecords) > 0 ? "bg-[#8b5cf6]" : "bg-gray-600"}`} />
                <span className="text-gray-400">{totalRecords?.toString() ?? "0"} Verified Contributions</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00f0ff]" />
                <span className="text-gray-400">Sepolia Testnet</span>
              </div>
            </div>
          </div>

          {address && (
            <div
              className="px-3 py-2 rounded-lg text-xs font-mono text-gray-400 truncate"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {address.slice(0, 16)}…{address.slice(-8)}
            </div>
          )}

          {isStaked && (
            <div
              className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)" }}
            >
              <Shield className="w-3 h-3 text-[#8b5cf6]" />
              <span className="text-purple-300 font-medium">Soulbound Token Minted</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DevSubmitPRCard() {
  const { isConnected } = useAccount();
  const { data: isStaked } = useIsStaked();
  const [prUrl, setPrUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState("");

  const verifyPR = async () => {
    if (!prUrl.trim()) return;
    setStatus("loading");
    setMessage("");
    setTxHash("");

    try {
      const res = await fetch(`${BACKEND_URL}/api/logs`);
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const logs = await res.json();

      const match = prUrl.match(/\/pull\/(\d+)/);
      const prId = match?.[1];

      if (!prId) {
        setStatus("error");
        setMessage("Invalid PR URL. Expected: github.com/owner/repo/pull/123");
        return;
      }

      const record = logs.find((l: { prId: string }) => l.prId === prId);

      if (!record) {
        setStatus("error");
        setMessage(`PR #${prId} not found in DevTrust backend. Make sure your PR body contains your wallet address.`);
        return;
      }

      if (record.status === "COMPLETED") {
        setStatus("success");
        setTxHash(record.txHash ?? "");
        setMessage(`PR #${prId} verified and recorded on-chain!`);
      } else if (record.status === "PENDING_BLOCKCHAIN") {
        setStatus("error");
        setMessage(`PR #${prId} is queued. Check back in ~10 seconds.`);
      } else if (record.status === "FAILED") {
        setStatus("error");
        setMessage(`PR #${prId} failed: ${record.error || "unknown error"}`);
      } else {
        setStatus("error");
        setMessage(`PR #${prId} status: ${record.status}`);
      }
    } catch {
      setStatus("error");
      setMessage(`Could not reach backend. Is it running at ${BACKEND_URL}?`);
    }
  };

  const canSubmit = isConnected && !!isStaked && !!prUrl.trim() && status !== "loading";

  return (
    <div
      className="glass-strong rounded-2xl p-7 border"
      style={{ borderColor: "rgba(139,92,246,0.25)" }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)" }}
        >
          <GitBranch className="w-5 h-5 text-[#8b5cf6]" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Submit Contribution
          </h3>
          <p className="text-xs text-gray-500">Check if your PR has been verified on-chain</p>
        </div>
      </div>

      {!isConnected && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4 text-xs"
          style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}
        >
          <AlertCircle className="w-4 h-4 text-[#8b5cf6]" />
          <span className="text-purple-300">Connect your wallet to submit contributions.</span>
        </div>
      )}

      {isConnected && !isStaked && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4 text-xs"
          style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)" }}
        >
          <AlertCircle className="w-4 h-4 text-yellow-400" />
          <span className="text-yellow-300">You must stake first before submitting contributions.</span>
        </div>
      )}

      <div className="space-y-3">
        <input
          type="text"
          placeholder="https://github.com/owner/repo/pull/1"
          value={prUrl}
          onChange={(e) => {
            setPrUrl(e.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          onKeyDown={(e) => e.key === "Enter" && canSubmit && verifyPR()}
          disabled={!isConnected || !isStaked}
          className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/30 disabled:opacity-40 transition-all focus:outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          onFocus={(e) => (e.target.style.borderColor = "rgba(139,92,246,0.5)")}
          onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
        />

        {status !== "idle" && (
          <div
            className="flex items-start gap-2 px-4 py-3 rounded-xl text-xs"
            style={{
              background: status === "success" ? "rgba(16,185,129,0.1)" : status === "error" ? "rgba(239,68,68,0.1)" : "rgba(0,240,255,0.1)",
              border: `1px solid ${status === "success" ? "rgba(16,185,129,0.3)" : status === "error" ? "rgba(239,68,68,0.3)" : "rgba(0,240,255,0.3)"}`,
            }}
          >
            {status === "loading" ? (
              <Loader2 className="w-4 h-4 text-[#00f0ff] animate-spin flex-shrink-0" />
            ) : status === "success" ? (
              <CheckCircle className="w-4 h-4 text-[#10b981] flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            <div>
              <span style={{ color: status === "success" ? "#10b981" : status === "error" ? "#fca5a5" : "#00f0ff" }}>
                {status === "loading" ? "Checking backend..." : message}
              </span>
              {status === "success" && txHash && <TxLink hash={txHash} />}
            </div>
          </div>
        )}
      </div>

      {!isConnected ? (
        <ConnectWalletButton variant="inline" className="w-full justify-center mt-4" />
      ) : (
        <button
          onClick={verifyPR}
          disabled={!canSubmit}
          className="mt-4 w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: canSubmit
              ? "linear-gradient(135deg, rgba(139,92,246,0.6), rgba(0,240,255,0.4))"
              : "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "white",
          }}
        >
          {status === "loading" ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Verifying...</>
          ) : (
            <><CheckCircle className="w-4 h-4" />Verify & Register</>
          )}
        </button>
      )}
    </div>
  );
}

function DevContributionHistoryCard() {
  const { isConnected } = useAccount();
  const { data: isStaked } = useIsStaked();

  const mockHistory = [
    { pr: "#4821", repo: "ethereum/solidity", status: "COMPLETED", date: "2d ago" },
    { pr: "#1204", repo: "wagmi-dev/wagmi", status: "COMPLETED", date: "5d ago" },
    { pr: "#892", repo: "vitejs/vite", status: "PENDING_BLOCKCHAIN", date: "1h ago" },
  ];

  return (
    <div
      className="glass-strong rounded-2xl p-7 border"
      style={{ borderColor: "rgba(249,43,136,0.2)" }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(249,43,136,0.1)", border: "1px solid rgba(249,43,136,0.3)" }}
        >
          <Activity className="w-5 h-5 text-[#f92b88]" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Contribution History
          </h3>
          <p className="text-xs text-gray-500">Your verified PR submissions</p>
        </div>
      </div>

      {!isConnected || !isStaked ? (
        <div className="text-center py-6 text-gray-500 text-xs">
          {!isConnected ? "Connect wallet to view history" : "Stake to start earning contribution records"}
        </div>
      ) : (
        <div className="space-y-3">
          {mockHistory.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5 text-[#8b5cf6]" />
                <div>
                  <span className="text-white font-medium">{item.pr}</span>
                  <span className="text-gray-500 ml-1">{item.repo}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="px-2 py-0.5 rounded-md font-medium"
                  style={{
                    background: item.status === "COMPLETED" ? "rgba(16,185,129,0.12)" : "rgba(251,191,36,0.12)",
                    color: item.status === "COMPLETED" ? "#10b981" : "#fbbf24",
                  }}
                >
                  {item.status === "COMPLETED" ? "Verified" : "Pending"}
                </span>
                <span className="text-gray-500">{item.date}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeveloperPage() {
  const { data: isStaked, refetch: refetchIsStaked } = useIsStaked();
  const { stake, hash, isConfirming, isSuccess, error, isLoading } = useStake();
  const { isConnected } = useAccount();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      refetchIsStaked();
    }
  }, [isSuccess]);

  return (
    <div className="space-y-6">
      {/* Stake banner — only shown if connected but not yet staked */}
      {isConnected && !isStaked && (
        <div
          className="glass-strong rounded-2xl p-6 border flex items-center justify-between gap-6"
          style={{ borderColor: "rgba(0,240,255,0.3)", background: "rgba(0,240,255,0.04)" }}
        >
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(0,240,255,0.1)", border: "1px solid rgba(0,240,255,0.3)" }}
            >
              <Shield className="w-5 h-5 text-[#00f0ff]" />
            </div>
            <div>
              <p className="text-sm font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
                Stake to Unlock Contributions
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Stake {MIN_STAKE_ETH} Sepolia ETH to register as a developer and submit PRs for verification.
              </p>
              {error && <p className="text-xs text-red-400 mt-1">{(error as Error).message?.slice(0, 100)}</p>}
              {isSuccess && hash && (
                <div>
                  <p className="text-xs text-[#10b981]">✓ Stake confirmed!</p>
                  <TxLink hash={hash} />
                </div>
              )}
            </div>
          </div>
          <button
            onClick={stake}
            disabled={isLoading}
            className="flex-shrink-0 px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #00f0ff, #8b5cf6)", color: "#0a0a0f" }}
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{isConfirming ? "Confirming..." : "Waiting..."}</>
            ) : (
              `Stake ${MIN_STAKE_ETH} ETH`
            )}
          </button>
        </div>
      )}

      {isConnected && isStaked && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs"
          style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}
        >
          <CheckCircle className="w-4 h-4 text-[#10b981]" />
          <span className="text-[#10b981] font-medium">You are staked and active on Sepolia</span>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <DevTrustScoreCard />
        <DevSubmitPRCard />
        <DevContributionHistoryCard />
      </div>
    </div>
  );
}

// ─── REVIEWER PAGE ────────────────────────────────────────────────────────────

interface GitHubRepo {
  id: number;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  open_issues_count: number;
  topics: string[];
  html_url: string;
}

interface ProjectData {
  id: string;
  name: string;
  description: string;
  language: string;
  openPRs: number;
  totalStaked: string;
  minStake: string;
  trustScore: number;
  tags: string[];
  html_url: string;
}

const MOCK_PROJECTS_FALLBACK: ProjectData[] = [
  { id: "1", name: "ethereum/go-ethereum", description: "Official Go implementation of the Ethereum protocol.", language: "Go", openPRs: 14, totalStaked: "2.45", minStake: "0.01", trustScore: 98, tags: ["core", "L1", "high-impact"], html_url: "https://github.com/ethereum/go-ethereum" },
  { id: "2", name: "wagmi-dev/wagmi", description: "React Hooks for Ethereum. TypeScript-first Web3 library.", language: "TypeScript", openPRs: 7, totalStaked: "0.87", minStake: "0.001", trustScore: 91, tags: ["frontend", "hooks", "tooling"], html_url: "https://github.com/wagmi-dev/wagmi" },
  { id: "3", name: "OpenZeppelin/contracts", description: "Library for secure smart contract development.", language: "Solidity", openPRs: 5, totalStaked: "1.32", minStake: "0.005", trustScore: 96, tags: ["security", "contracts", "audited"], html_url: "https://github.com/OpenZeppelin/openzeppelin-contracts" },
  { id: "4", name: "vitejs/vite", description: "Next generation frontend tooling.", language: "TypeScript", openPRs: 22, totalStaked: "0.41", minStake: "0.001", trustScore: 89, tags: ["frontend", "build", "popular"], html_url: "https://github.com/vitejs/vite" },
];

const LANG_COLORS: Record<string, string> = {
  Go: "#00add8",
  TypeScript: "#3178c6",
  Solidity: "#aa6746",
  Rust: "#dea584",
  Python: "#3572a5",
};

function ReviewerStakeCard({ onStakeSuccess }: { onStakeSuccess: () => void }) {
  const { isConnected } = useAccount();
  const { data: isStaked, refetch: refetchIsStaked } = useIsStaked();
  const { formatted: stakeAmount } = useStakeAmount();
  const { stake, hash, isConfirming, isSuccess, error, isLoading } = useStake();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      refetchIsStaked().then(() => onStakeSuccess());
    }
  }, [isSuccess]);

  return (
    <div
      className="glass-strong rounded-2xl p-6 border flex flex-col"
      style={{ borderColor: "rgba(0,240,255,0.25)" }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(0,240,255,0.1)", border: "1px solid rgba(0,240,255,0.3)" }}
        >
          <Shield className="w-5 h-5 text-[#00f0ff]" />
        </div>
        <div>
          <h3 className="font-bold text-white text-base" style={{ fontFamily: "var(--font-display)" }}>
            Reviewer Status
          </h3>
          <p className="text-xs text-gray-500">Stake to unlock project review</p>
        </div>
      </div>

      {isStaked ? (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4 text-xs"
          style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}
        >
          <CheckCircle className="w-4 h-4 text-[#10b981]" />
          <span className="text-[#10b981] font-medium">Active Reviewer — Staked {stakeAmount} ETH</span>
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-4 flex-1">
          Stake {MIN_STAKE_ETH} Sepolia ETH to become a reviewer. You can then stake on individual projects
          and earn rewards for accurate attestations.
        </p>
      )}

      {error && (
        <div
          className="flex items-start gap-2 px-4 py-3 rounded-xl mb-3 text-xs"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}
        >
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-red-300">{(error as Error).message?.slice(0, 100)}</span>
        </div>
      )}

      {isSuccess && hash && (
        <div
          className="px-4 py-3 rounded-xl mb-3"
          style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}
        >
          <p className="text-xs text-[#10b981]">✓ Stake confirmed!</p>
          <TxLink hash={hash} />
        </div>
      )}

      {!isConnected ? (
        <ConnectWalletButton variant="inline" className="w-full justify-center" />
      ) : (
        <button
          onClick={stake}
          disabled={isLoading || !!isStaked}
          className="w-full py-3 px-6 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: isStaked ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #00f0ff, #8b5cf6)",
            color: isStaked ? "#94a3b8" : "#0a0a0f",
          }}
        >
          {isLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" />{isConfirming ? "Confirming..." : "Waiting..."}</>
          ) : isStaked ? "Already Staked" : `Stake ${MIN_STAKE_ETH} ETH`}
        </button>
      )}
    </div>
  );
}

function ManualEntryCard({ onStakeManual, isStaked }: { onStakeManual: (url: string) => void; isStaked: boolean }) {
  const [url, setUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { isConnected } = useAccount();
  const canSubmit = isConnected && isStaked && !!url.trim() && !submitted;

  const handleStake = () => {
    if (!url.trim()) return;
    onStakeManual(url.trim());
    setSubmitted(true);
    setTimeout(() => {
      setUrl("");
      setSubmitted(false);
    }, 3000);
  };

  return (
    <div
      className="glass-strong rounded-2xl p-6 border"
      style={{ borderColor: "rgba(249,43,136,0.2)" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(249,43,136,0.1)", border: "1px solid rgba(249,43,136,0.3)" }}
        >
          <Plus className="w-5 h-5 text-[#f92b88]" />
        </div>
        <div>
          <h3 className="font-bold text-white text-base" style={{ fontFamily: "var(--font-display)" }}>
            Stake on Any Project
          </h3>
          <p className="text-xs text-gray-500">Enter a GitHub repo or PR URL manually</p>
        </div>
      </div>

      <input
        type="text"
        placeholder="https://github.com/owner/repo or .../pull/123"
        value={url}
        onChange={(e) => { setUrl(e.target.value); setSubmitted(false); }}
        disabled={!isConnected || !isStaked}
        className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/30 disabled:opacity-40 transition-all focus:outline-none mb-3"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
        onFocus={(e) => (e.target.style.borderColor = "rgba(249,43,136,0.5)")}
        onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
        onKeyDown={(e) => e.key === "Enter" && handleStake()}
      />

      {submitted && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl mb-3 text-xs"
          style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}
        >
          <CheckCircle className="w-4 h-4 text-[#10b981]" />
          <span className="text-[#10b981] font-medium">Staked! Recorded in My Stakes below.</span>
        </div>
      )}

      <button
        onClick={handleStake}
        disabled={!canSubmit}
        className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: submitted
            ? "rgba(16,185,129,0.15)"
            : canSubmit
            ? "linear-gradient(135deg, rgba(249,43,136,0.3), rgba(139,92,246,0.3))"
            : "rgba(255,255,255,0.04)",
          border: submitted ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(255,255,255,0.1)",
          color: "white",
        }}
      >
        {submitted ? (
          <><CheckCircle className="w-4 h-4 text-[#10b981]" /><span className="text-[#10b981]">Staked!</span></>
        ) : (
          <><Search className="w-4 h-4" />Look Up & Stake</>
        )}
      </button>
    </div>
  );
}

function StakeOnProjectModal({
  project,
  onClose,
  githubId,
}: {
  project: ProjectData;
  onClose: () => void;
  githubId?: string;
}) {
  const { stake, hash, isConfirming, isSuccess, error, isLoading } = useStakeCustomAmount();
  const [customAmount, setCustomAmount] = useState(project.minStake);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      if (githubId) {
        saveStake(githubId, {
          projectName: project.name,
          projectId: project.id,
          amount: customAmount,
          type: "project",
          stakedAt: new Date().toISOString(),
        });
        // Write to PR registry so developer can see reviewer count
        // project.name is used as the PR key for project stakes
        addReviewerStakeToRegistry(project.name, {
          githubId,
          githubLogin: githubId,
          amount: customAmount,
        });
      }
    }
  }, [isSuccess]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="glass-strong rounded-2xl p-8 border w-full max-w-md"
        style={{ borderColor: "rgba(0,240,255,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(0,240,255,0.1)", border: "1px solid rgba(0,240,255,0.3)" }}
          >
            <Layers className="w-5 h-5 text-[#00f0ff]" />
          </div>
          <div>
            <h3 className="font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>Stake on Project</h3>
            <p className="text-xs text-gray-500">{project.name}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Stake Amount (ETH)</label>
            <input
              type="number"
              value={customAmount}
              min={project.minStake}
              step="0.001"
              onChange={(e) => setCustomAmount(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm text-white focus:outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,240,255,0.3)" }}
            />
            <p className="text-[10px] text-gray-500 mt-1">Minimum: {project.minStake} ETH</p>
          </div>

          <div
            className="px-4 py-3 rounded-xl text-xs"
            style={{ background: "rgba(0,240,255,0.05)", border: "1px solid rgba(0,240,255,0.15)" }}
          >
            <p className="text-gray-400">
              By staking, you vouch for contributions in{" "}
              <span className="text-[#00f0ff]">{project.name}</span>. Your stake earns rewards for
              accurate reviews or may be slashed for false attestations.
            </p>
          </div>

          {error && (
            <div
              className="flex items-start gap-2 px-4 py-3 rounded-xl text-xs"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-red-300">{(error as Error).message?.slice(0, 120)}</span>
            </div>
          )}

          {isSuccess && hash && (
            <div
              className="px-4 py-3 rounded-xl text-xs"
              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}
            >
              <p className="text-[#10b981]">✓ Stake confirmed!</p>
              <TxLink hash={hash} />
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400 transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              Cancel
            </button>
            <button
              onClick={() => stake(customAmount)}
              disabled={isLoading || isSuccess}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #00f0ff, #8b5cf6)", color: "#0a0a0f" }}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{isConfirming ? "Confirming..." : "Waiting..."}</>
              ) : isSuccess ? "Staked!" : `Stake ${customAmount} ETH`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onStake,
  isStaked,
}: {
  project: ProjectData;
  onStake: (p: ProjectData) => void;
  isStaked: boolean | undefined;
}) {
  const { isConnected } = useAccount();

  return (
    <div
      className="glass-strong rounded-2xl p-6 border flex flex-col gap-4 transition-all hover:border-white/20"
      style={{ borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ background: LANG_COLORS[project.language] ?? "#9ca3af" }} />
            <span className="text-[10px] text-gray-500 font-mono">{project.language}</span>
          </div>
          <h4 className="text-sm font-bold text-white truncate" style={{ fontFamily: "var(--font-display)" }}>
            {project.name}
          </h4>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{project.description}</p>
        </div>
        <div
          className="flex-shrink-0 text-center px-3 py-1.5 rounded-lg"
          style={{ background: "rgba(0,240,255,0.08)", border: "1px solid rgba(0,240,255,0.15)" }}
        >
          <div className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>
            {project.trustScore}
          </div>
          <div className="text-[9px] text-gray-500">trust</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {project.tags.map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-2 py-0.5 rounded-md text-gray-400"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            #{tag}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {[
          { label: "Open PRs", value: project.openPRs, color: "#f92b88" },
          { label: "Total Staked", value: `${project.totalStaked} ETH`, color: "#8b5cf6" },
          { label: "Min Stake", value: `${project.minStake} ETH`, color: "#10b981" },
        ].map((s) => (
          <div
            key={s.label}
            className="px-2 py-2 rounded-lg"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[9px] text-gray-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() => onStake(project)}
        disabled={!isConnected || !isStaked}
        className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: isConnected && isStaked
            ? "linear-gradient(135deg, rgba(0,240,255,0.15), rgba(139,92,246,0.15))"
            : "rgba(255,255,255,0.04)",
          border: isConnected && isStaked
            ? "1px solid rgba(0,240,255,0.3)"
            : "1px solid rgba(255,255,255,0.08)",
          color: isConnected && isStaked ? "#00f0ff" : "#4b5563",
        }}
      >
        <Layers className="w-4 h-4" />
        Stake on Project
      </button>
    </div>
  );
}

// ─── My Stakes Panel ──────────────────────────────────────────────────────────

function MyStakesPanel({ githubId }: { githubId: string }) {
  const [stakes, setStakes] = useState<StakeRecord[]>([]);
  const [registry, setRegistry] = useState<Record<string, PREntry>>({});

  const refresh = () => {
    setStakes(loadStakes(githubId));
    setRegistry(loadRegistry());
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [githubId]);

  const timeAgo = (iso: string) => {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  };

  const totalEth = stakes.reduce((sum, s) => sum + parseFloat(s.amount || "0"), 0).toFixed(4);

  const handleVote = (prUrl: string, vote: "approve" | "reject") => {
    castVote(prUrl, githubId, vote);
    refresh();
  };

  return (
    <div className="glass-strong rounded-2xl border border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-[#8b5cf6]" />
          <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            My Stakes
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            Total staked: <span className="text-[#8b5cf6] font-bold">{totalEth} ETH</span>
          </span>
          <span
            className="text-xs px-3 py-1 rounded-full"
            style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", color: "#8b5cf6" }}
          >
            {stakes.length} positions
          </span>
        </div>
      </div>

      {stakes.length === 0 ? (
        <div className="p-10 text-center text-gray-500 text-sm">
          No stakes yet. Stake on a project above to track your positions here.
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {stakes.map((s, i) => {
            const key = s.url ?? s.projectName;
            const entry = registry[key];
            const totalStaked = entry?.totalEthStaked ?? 0;
            const thresholdMet = entry?.thresholdMet ?? false;
            const reviewerCount = entry?.reviewerStakes?.length ?? 0;
            const myStake = entry?.reviewerStakes?.find((r) => r.githubId === githubId);
            const myVote = myStake?.vote;
            const approved = entry?.outcome === "approved";
            const rejected = entry?.outcome === "rejected";
            const resolved = entry?.resolved ?? false;
            const bonus = reviewerBonus(s.amount);
            const ethProgress = Math.min(totalStaked / ETH_THRESHOLD, 1);

            // vote tally
            const approves = entry?.reviewerStakes?.filter((r) => r.vote === "approve").length ?? 0;
            const rejects  = entry?.reviewerStakes?.filter((r) => r.vote === "reject").length ?? 0;
            const totalVotes = approves + rejects;

            const iconColor = approved ? "#10b981" : rejected ? "#f87171" : "#8b5cf6";
            const iconBg    = approved ? "rgba(16,185,129,0.12)" : rejected ? "rgba(239,68,68,0.1)" : "rgba(139,92,246,0.1)";

            return (
              <div key={i} className="p-5 hover:bg-white/[0.02] transition-all">
                {/* Row header */}
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: iconBg, border: `1px solid ${iconColor}44` }}
                  >
                    <Layers className="w-5 h-5" style={{ color: iconColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{s.projectName}</div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />{timeAgo(s.stakedAt)}
                      </span>
                      <span className="flex items-center gap-1 text-xs"
                        style={{ color: thresholdMet ? "#10b981" : "#9ca3af" }}>
                        <Users className="w-3 h-3" />
                        {reviewerCount} reviewer{reviewerCount !== 1 ? "s" : ""}
                      </span>
                      {s.type === "manual" && <span className="text-xs text-[#f92b88]">manual</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noopener noreferrer"
                        className="text-gray-600 hover:text-[#00f0ff] transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <span className="text-sm font-bold px-3 py-1 rounded-lg"
                      style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#8b5cf6" }}>
                      {s.amount} ETH
                    </span>
                    {/* Status badge */}
                    {resolved ? (
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={approved
                          ? { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981" }
                          : { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
                        {approved ? "✓ Approved" : "✗ Rejected"}
                      </span>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24" }}>
                        {thresholdMet ? "Voting" : "Staking"}
                      </span>
                    )}
                  </div>
                </div>

                {/* ETH threshold progress */}
                <div className="mt-4 ml-14">
                  <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1.5">
                    <span>ETH staked on this PR</span>
                    <span style={{ color: thresholdMet ? "#10b981" : "#9ca3af" }}>
                      {totalStaked.toFixed(4)} / {ETH_THRESHOLD} ETH
                      {thresholdMet ? " ✓ voting unlocked" : ""}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${ethProgress * 100}%`,
                        background: thresholdMet ? "linear-gradient(90deg,#10b981,#00f0ff)" : "linear-gradient(90deg,#8b5cf6,#6366f1)"
                      }} />
                  </div>
                </div>

                {/* Vote buttons — shown only after threshold met, before resolution */}
                {thresholdMet && !resolved && (
                  <div className="mt-4 ml-14">
                    {myVote ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <CheckCircle className="w-3.5 h-3.5 text-[#10b981]" />
                        You voted <span className="font-semibold"
                          style={{ color: myVote === "approve" ? "#10b981" : "#f87171" }}>
                          {myVote}
                        </span>
                        {totalVotes > 0 && (
                          <span className="ml-2 text-gray-500">
                            · {approves} approve · {rejects} reject
                          </span>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-gray-400 mb-2">
                          ETH threshold met — cast your vote on this PR:
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleVote(key, "approve")}
                            className="flex-1 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5"
                            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)", color: "#10b981" }}
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => handleVote(key, "reject")}
                            className="flex-1 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5"
                            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
                          >
                            <AlertCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                        {totalVotes > 0 && (
                          <p className="text-[10px] text-gray-500 mt-1.5">
                            Current tally: {approves} approve · {rejects} reject
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Resolution banner */}
                {resolved && (
                  <div className="mt-4 ml-14 px-4 py-3 rounded-xl text-xs flex items-start gap-2"
                    style={approved
                      ? { background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }
                      : { background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    {approved ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" />
                        <span className="text-[#10b981]">
                          PR approved by majority vote! Your stake of <strong>{s.amount} ETH</strong> has been
                          refunded + <strong>{bonus} ETH</strong> bonus ({BONUS_PERCENT}% reward).
                          Total returned: <strong>{(parseFloat(s.amount) + parseFloat(bonus)).toFixed(4)} ETH</strong>.
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <span className="text-red-300">
                          PR rejected by majority vote. Your stake of {s.amount} ETH was not returned.
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReviewerPage() {
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<ProjectData[]>(MOCK_PROJECTS_FALLBACK);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [stakeTarget, setStakeTarget] = useState<ProjectData | null>(null);
  const { data: isStaked, refetch: refetchIsStaked } = useIsStaked();
  const { isConnected } = useAccount();
  const { user } = useGitHubAuth();

  useEffect(() => {
    if (!search.trim()) {
      setProjects(MOCK_PROJECTS_FALLBACK);
      setSearchError("");
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      setSearchError("");
      try {
        const res = await fetch(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(search)}&sort=stars&order=desc&per_page=8`,
          { headers: { Accept: "application/vnd.github+json" } }
        );
        if (res.status === 403) {
          setSearchError("GitHub rate limit reached. Try again in a minute.");
          setIsSearching(false);
          return;
        }
        const data = await res.json();
        const repos: ProjectData[] = (data.items ?? []).map((r: GitHubRepo) => ({
          id: String(r.id),
          name: r.full_name,
          description: r.description ?? "No description provided.",
          language: r.language ?? "Unknown",
          openPRs: r.open_issues_count,
          totalStaked: (Math.random() * 2).toFixed(3),
          minStake: "0.001",
          trustScore: Math.floor(70 + Math.random() * 30),
          tags: r.topics.slice(0, 3).length ? r.topics.slice(0, 3) : [r.language ?? "code"],
          html_url: r.html_url,
        }));
        setProjects(repos);
      } catch {
        setSearchError("Could not reach GitHub API. Check your connection.");
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);
  
  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-5">
        <ReviewerStakeCard onStakeSuccess={() => refetchIsStaked()} />
        <ManualEntryCard
          isStaked={!!isStaked}
          onStakeManual={(url) => {
            if (user) {
              saveStake(user.id, {
                projectName: url,
                projectId: `manual-${Date.now()}`,
                amount: MIN_STAKE_ETH,
                type: "manual",
                url,
                stakedAt: new Date().toISOString(),
              });
              // Also record this in the shared PR registry so developer sees reviewer count
              addReviewerStakeToRegistry(url, {
                githubId: user.id,
                githubLogin: user.login,
                amount: MIN_STAKE_ETH,
              });
            }
          }}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
              Browse Active Projects
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Projects open for reviewer staking</p>
          </div>
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-500">
              {isSearching ? "Searching…" : `${projects.length} projects`}
            </span>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search GitHub repos"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(0,240,255,0.4)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
          />
        </div>

        {!isConnected && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4 text-xs"
            style={{ background: "rgba(0,240,255,0.06)", border: "1px solid rgba(0,240,255,0.2)" }}
          >
            <AlertCircle className="w-4 h-4 text-[#00f0ff]" />
            <span className="text-[#00f0ff]">Connect wallet and stake to stake on projects.</span>
          </div>
        )}

        {isConnected && !isStaked && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4 text-xs"
            style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}
          >
            <AlertCircle className="w-4 h-4 text-yellow-400" />
            <span className="text-yellow-300">Become a reviewer first by staking above.</span>
          </div>
        )}

        {searchError && (
  <div className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4 text-xs"
    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
    <AlertCircle className="w-4 h-4 text-red-400" />
    <span className="text-red-300">{searchError}</span>
  </div>
)}
{isSearching && (
  <div className="flex items-center justify-center py-12 gap-3 text-gray-400 text-sm">
    <div className="w-4 h-4 border-2 border-[#00f0ff]/40 border-t-[#00f0ff] rounded-full animate-spin" />
    Searching GitHub…
  </div>
)}
{!isSearching && projects.length === 0 && search.trim() && (
  <div className="text-center py-12 text-gray-500 text-sm">
    No repositories found for "{search}".
  </div>
)}
{!isSearching && (
  <div className="grid sm:grid-cols-2 gap-4">
    {projects.map((p) => (
      <ProjectCard key={p.id} project={p} isStaked={!!isStaked} onStake={(proj) => setStakeTarget(proj)} />
    ))}
  </div>
)}
      </div> {/* closes Browse Active Projects div */}

      {/* My Stakes Panel */}

      {/* My Stakes Panel */}
      {user && <MyStakesPanel githubId={user.id} />}

      {stakeTarget && (
        <StakeOnProjectModal
          project={stakeTarget}
          onClose={() => setStakeTarget(null)}
          githubId={user?.id}
        />
      )}
    </div>
  );
}

// ─── Export internal pages for use in route-level components ─────────────────
export { DeveloperPage, ReviewerPage };

// ─── Main Export (used on landing page — shows only ContributionFeed) ─────────

export function DashboardSection() {
  return (
    <section id="dashboard" className="relative z-10 py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <ContributionFeed />
      </div>
    </section>
  );
}