import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useUserRoles, type UserRoles, type SBToken } from "./UserRolesContext";
import { useGitHubAuth } from "./GitHubAuth";
import { useIsStaked, useTotalRecords } from "./hooks";
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
} from "lucide-react";

// ─── Submission Storage Helpers ───────────────────────────────────────────────

export interface SubmissionRecord {
  prUrl: string;
  status: "Pending" | "Verified" | "Failed";
  submittedAt: string; // ISO string
}

function submissionKey(githubId: string) {
  return `devtrust_submissions_${githubId}`;
}

export function loadSubmissions(githubId: string): SubmissionRecord[] {
  try {
    const raw = sessionStorage.getItem(submissionKey(githubId));
    return raw ? (JSON.parse(raw) as SubmissionRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveSubmission(githubId: string, record: SubmissionRecord) {
  try {
    const existing = loadSubmissions(githubId);
    // avoid duplicates
    const filtered = existing.filter((r) => r.prUrl !== record.prUrl);
    sessionStorage.setItem(submissionKey(githubId), JSON.stringify([record, ...filtered]));
  } catch {}
}

// ─── Trust Score Card ──────────────────────────────────────────────────────────
function DevTrustScoreCard() {
  const { isConnected } = useAccount();
  const { data: isStaked } = useIsStaked();
  const { data: totalRecords } = useTotalRecords();
  const { roles } = useUserRoles();

  const verifiedPRs = Number(totalRecords ?? 0);
  const sbtBonus = roles.sbtCount * 5;
  const stakedBonus = isStaked ? 10 : 0;
  const score = isConnected
    ? Math.min(100, verifiedPRs * 15 + sbtBonus + stakedBonus)
    : 0;

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - score / 100);

  const getScoreColor = (s: number) => {
    if (s >= 80) return "#10b981";
    if (s >= 50) return "#00f0ff";
    if (s >= 20) return "#8b5cf6";
    return "#6b7280";
  };

  const color = getScoreColor(score);

  return (
    <div className="glass-strong rounded-2xl border border-white/10 p-8 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-5 rounded-2xl"
        style={{ background: `radial-gradient(circle at 30% 50%, ${color}, transparent 60%)` }}
      />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-[#00f0ff]" />
          <span className="text-sm font-semibold text-gray-300 uppercase tracking-widest">
            DevTrust Score
          </span>
        </div>

        <div className="flex items-center gap-8">
          {/* Ring */}
          <div className="relative w-36 h-36 flex-shrink-0">
            <svg className="w-36 h-36 -rotate-90" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
              <circle
                cx="64" cy="64" r={radius}
                fill="none"
                stroke={color}
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: "stroke-dashoffset 1s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold" style={{ color, fontFamily: "var(--font-display)" }}>
                {score}
              </span>
              <span className="text-xs text-gray-500">/100</span>
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-3 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Verified PRs</span>
              <span className="font-semibold text-white">{verifiedPRs}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">SBTs Earned</span>
              <span className="font-semibold text-white">{roles.sbtCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Staking Bonus</span>
              <span className="font-semibold" style={{ color: isStaked ? "#10b981" : "#6b7280" }}>
                {isStaked ? "+10" : "Not staked"}
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-white/10 text-xs text-gray-500">
              Score = (PRs × 15) + (SBTs × 5) + staking bonus
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SBT Card ─────────────────────────────────────────────────────────────────
function SBTCard({ token, index }: { token: SBToken; index: number }) {
  return (
    <div className="relative group" style={{ animationDelay: `${index * 0.1}s` }}>
      <div
        className="absolute inset-0 rounded-2xl blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-500"
        style={{ background: token.color }}
      />
      <div className="relative glass-strong rounded-2xl border border-white/10 group-hover:border-white/30 transition-all duration-300 overflow-hidden">
        <div className={`h-1 w-full bg-gradient-to-r ${token.gradient}`} />
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${token.gradient} flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
              {token.icon}
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-gray-500" />
                <span className="text-xs text-gray-500 font-mono">SOULBOUND</span>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ color: token.color, background: `${token.color}20`, border: `1px solid ${token.color}40` }}
              >
                {token.level}
              </span>
            </div>
          </div>
          <h3 className="font-bold text-base mb-0.5" style={{ fontFamily: "var(--font-display)" }}>
            {token.name}
          </h3>
          <p className="text-sm text-gray-400 mb-4">{token.skill}</p>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                <circle
                  cx="24" cy="24" r="18"
                  fill="none" stroke={token.color} strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 18}`}
                  strokeDashoffset={`${2 * Math.PI * 18 * (1 - token.score / 100)}`}
                  strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 3px ${token.color})` }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold" style={{ color: token.color }}>{token.score}</span>
              </div>
            </div>
            <div>
              <div className="text-xl font-bold" style={{ fontFamily: "var(--font-display)", color: token.color }}>
                {token.contributions}
              </div>
              <div className="text-xs text-gray-500">contributions</div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-white/10">
            <span className="text-xs text-gray-500 font-mono">#{String(token.id).padStart(4, "0")}</span>
            <span className="text-xs text-gray-500">Earned {token.earnedAt}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Submit Contribution ───────────────────────────────────────────────────────
function SubmitContribution() {
  const [prUrl, setPrUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const { user } = useGitHubAuth();

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

  const handleSubmit = async () => {
    if (!prUrl.trim()) return;
    setStatus("loading");
    setMessage("");
    const trimmed = prUrl.trim();
    try {
      const res = await fetch(`${BACKEND_URL}/api/logs`);
      const data = await res.json();
      const logs: Array<{ prUrl?: string; status?: string }> = data.logs || data;
      const found = logs.find(
        (l) => l.prUrl === trimmed && l.status === "PROCESSED"
      );
      if (found) {
        setStatus("success");
        setMessage("✅ PR verified on-chain! Your contribution is recorded.");
        if (user) {
          saveSubmission(user.id, { prUrl: trimmed, status: "Verified", submittedAt: new Date().toISOString() });
        }
      } else {
        setStatus("error");
        setMessage("❌ PR not found or not yet processed. Make sure it's been merged and the webhook fired.");
        if (user) {
          saveSubmission(user.id, { prUrl: trimmed, status: "Pending", submittedAt: new Date().toISOString() });
        }
      }
    } catch {
      setStatus("error");
      setMessage("❌ Could not reach backend. Is it running?");
    }
  };

  return (
    <div className="glass-strong rounded-2xl border border-white/10 p-8">
      <div className="flex items-center gap-2 mb-6">
        <GitMerge className="w-5 h-5 text-[#00f0ff]" />
        <span className="text-sm font-semibold text-gray-300 uppercase tracking-widest">
          Submit Contribution
        </span>
      </div>

      <p className="text-gray-400 text-sm mb-6">
        Enter a merged GitHub PR URL to verify it on-chain and earn reputation.
      </p>

      <div className="flex gap-3">
        <input
          type="text"
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          placeholder="https://github.com/owner/repo/pull/123"
          className="flex-1 glass px-4 py-3 rounded-lg border border-white/20 focus:border-[#00f0ff]/50 focus:outline-none text-sm bg-transparent text-white placeholder-gray-500 transition-colors"
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <button
          onClick={handleSubmit}
          disabled={status === "loading" || !prUrl.trim()}
          className="px-6 py-3 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #00f0ff, #8b5cf6)",
            color: "#000",
          }}
        >
          {status === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ExternalLink className="w-4 h-4" />
          )}
          Verify
        </button>
      </div>

      {message && (
        <div
          className={`mt-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
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

// ─── Gate: not logged in / not registered ─────────────────────────────────────
function DeveloperGate({ onRegister }: { onRegister: () => void }) {
  const { user } = useGitHubAuth();
  const { roles } = useUserRoles();

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="glass-strong rounded-2xl border border-white/10 p-12 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00f0ff]/20 to-[#8b5cf6]/20 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
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
          <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Register as Developer
          </h3>
          <p className="text-gray-400 mb-8">
            You need to register as a developer to access this dashboard and start earning reputation.
          </p>
          <button
            onClick={onRegister}
            className="px-8 py-3 rounded-lg font-semibold transition-all hover:scale-105"
            style={{ background: "linear-gradient(135deg, #00f0ff, #8b5cf6)", color: "#000" }}
          >
            Register Now
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── My Submissions Panel ─────────────────────────────────────────────────────
function MySubmissionsPanel({ githubId }: { githubId: string }) {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  interface RegEntry {
    reviewerStakes: Array<{ githubId: string; vote?: string }>;
    resolved: boolean;
    outcome?: "approved" | "rejected";
    totalEthStaked: number;
    thresholdMet: boolean;
  }
  const [registry, setRegistry] = useState<Record<string, RegEntry>>({});

  const refresh = () => {
    setSubmissions(loadSubmissions(githubId));
    try {
      const raw = sessionStorage.getItem("devtrust_pr_registry");
      setRegistry(raw ? JSON.parse(raw) : {});
    } catch {}
  };

  const recheckPending = async () => {
    const subs = loadSubmissions(githubId);
    const pending = subs.filter((s) => s.status === "Pending");
    if (pending.length === 0) return;
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
    try {
      const res = await fetch(`${BACKEND_URL}/api/logs`);
      const data = await res.json();
      const logs: Array<{ prUrl?: string; status?: string }> = data.logs || data;
      let changed = false;
      pending.forEach((p) => {
        const found = logs.find((l) => l.prUrl === p.prUrl && l.status === "PROCESSED");
        if (found) {
          saveSubmission(githubId, { ...p, status: "Verified" });
          changed = true;
        }
      });
      if (changed) refresh();
    } catch {}
  };

  useEffect(() => {
    refresh();
    recheckPending();
    const fastId = setInterval(refresh, 3000);
    const slowId = setInterval(recheckPending, 30000);
    return () => { clearInterval(fastId); clearInterval(slowId); };
  }, [githubId]);

  const ETH_THRESHOLD = 0.01; // must match DashboardSection

  const timeAgo = (iso: string) => {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  };

  const shortUrl = (url: string) => {
    const m = url.match(/github\.com\/([^/]+\/[^/]+)(?:\/pull\/(\d+))?/);
    if (m) return m[2] ? `${m[1]} #${m[2]}` : m[1];
    return url.length > 40 ? url.slice(0, 40) + "…" : url;
  };

  // Determine effective status: if PR is resolved in registry + was Verified → "Rewarded"
  const effectiveStatus = (s: SubmissionRecord) => {
    const entry = registry[s.prUrl];
    if (entry?.resolved) {
      if (entry.outcome === "approved" && s.status === "Verified") return "Rewarded";
      if (entry.outcome === "rejected") return "Rejected";
    }
    return s.status;
  };

  const statusStyle = (eff: string) => {
    if (eff === "Rewarded") return { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" };
    if (eff === "Rejected") return { color: "#f87171", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.3)" };
    if (eff === "Verified") return { color: "#10b981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)" };
    if (eff === "Pending") return { color: "#fbbf24", bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.3)" };
    return { color: "#f87171", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.3)" };
  };

  return (
    <div className="glass-strong rounded-2xl border border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-[#00f0ff]" />
          <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            My Submissions
          </h2>
        </div>
        <span
          className="text-xs px-3 py-1 rounded-full"
          style={{ background: "rgba(0,240,255,0.1)", border: "1px solid rgba(0,240,255,0.3)", color: "#00f0ff" }}
        >
          {submissions.length} total
        </span>
      </div>

      {submissions.length === 0 ? (
        <div className="p-10 text-center text-gray-500 text-sm">
          No submissions yet. Submit a PR URL above to track it here.
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {submissions.map((s, i) => {
            const entry = registry[s.prUrl];
            const reviewerCount = entry?.reviewerStakes?.length ?? 0;
            const resolved = entry?.resolved ?? false;
            const eff = effectiveStatus(s);
            const st = statusStyle(eff);
            const totalEthStaked = entry?.totalEthStaked ?? 0;
            const thresholdMet = entry?.thresholdMet ?? false;
            const approves = entry?.reviewerStakes?.filter((r: {vote?:string}) => r.vote === "approve").length ?? 0;
            const rejects  = entry?.reviewerStakes?.filter((r: {vote?:string}) => r.vote === "reject").length ?? 0;
            const progress = Math.min(totalEthStaked / ETH_THRESHOLD, 1);

            return (
              <div key={i} className="p-5 hover:bg-white/[0.02] transition-all">
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${st.color}18`, border: `1px solid ${st.color}44` }}
                  >
                    {eff === "Rewarded" ? (
                      <Award className="w-5 h-5" style={{ color: st.color }} />
                    ) : (
                      <GitMerge className="w-5 h-5" style={{ color: st.color }} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{shortUrl(s.prUrl)}</div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        {timeAgo(s.submittedAt)}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Users className="w-3 h-3" />
  <span style={{ color: thresholdMet ? "#10b981" : "#9ca3af" }}>
                          {totalEthStaked.toFixed(4)}/{ETH_THRESHOLD} ETH staked · {reviewerCount} reviewer{reviewerCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <a
                      href={s.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-600 hover:text-[#00f0ff] transition-colors"
                      title="Open PR"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    {s.status === "Pending" && (
                      <button
                        onClick={recheckPending}
                        className="text-xs px-2.5 py-1 rounded-lg transition-all hover:bg-white/10"
                        style={{ color: "#9ca3af", border: "1px solid rgba(255,255,255,0.1)" }}
                        title="Recheck against backend now"
                      >
                        ↻ Recheck
                      </button>
                    )}
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ color: st.color, background: st.bg, border: `1px solid ${st.border}` }}
                    >
                      {eff === "Rewarded" ? "🏆 SBT Earned" : eff === "Rejected" ? "✗ Rejected" : eff}
                    </span>
                  </div>
                </div>

                {/* Reviewer progress bar */}
                <div className="mt-3 ml-14">
                  <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1.5">
                    <span>ETH staking threshold ({ETH_THRESHOLD} ETH)</span>
                    <span style={{ color: thresholdMet ? "#10b981" : "#9ca3af" }}>
                      {thresholdMet
                        ? `✓ Threshold met · ${approves} approve · ${rejects} reject`
                        : `${(ETH_THRESHOLD - totalEthStaked).toFixed(4)} ETH more needed`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${progress * 100}%`,
                        background: resolved
                          ? "linear-gradient(90deg, #10b981, #f59e0b)"
                          : "linear-gradient(90deg, #00f0ff, #8b5cf6)",
                      }}
                    />
                  </div>
                </div>

                {eff === "Rewarded" && (
                  <div className="mt-3 ml-14 flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                    style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-amber-300">
                      Majority approved + PR verified. Soulbound Token awarded! Reviewers have been refunded + bonus.
                    </span>
                  </div>
                )}
                {eff === "Rejected" && (
                  <div className="mt-3 ml-14 flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                    style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-red-300">
                      Majority of reviewers rejected this PR. No SBT awarded.
                    </span>
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

// ─── Developer Page ────────────────────────────────────────────────────────────
export function DeveloperPage() {
  const { roles, registerDeveloper } = useUserRoles();
  const { user } = useGitHubAuth();

  const gate = <DeveloperGate onRegister={registerDeveloper} />;
  if (!user || !roles.isDeveloper) return gate;

  const totalContributions = roles.sbtTokens.reduce((a, t) => a + t.contributions, 0);
  const avgScore = roles.sbtTokens.length
    ? Math.round(roles.sbtTokens.reduce((a, t) => a + t.score, 0) / roles.sbtTokens.length)
    : 0;

  return (
    <div className="relative z-10 py-12 px-6 max-w-6xl mx-auto space-y-10">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full mb-4">
          <Sparkles className="w-4 h-4 text-[#00f0ff]" />
          <span className="text-sm" style={{ fontFamily: "var(--font-mono)" }}>
            Developer Dashboard
          </span>
        </div>
        <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
          Welcome back, <span className="gradient-text">@{user.login}</span>
        </h1>
        <p className="text-gray-400">Your on-chain reputation and contribution history.</p>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-strong rounded-xl p-5 border border-white/10 text-center">
          <div className="text-4xl font-bold gradient-text mb-1" style={{ fontFamily: "var(--font-display)" }}>
            {roles.sbtCount}
          </div>
          <div className="text-sm text-gray-400">SBTs Earned</div>
        </div>
        <div className="glass-strong rounded-xl p-5 border border-white/10 text-center">
          <div className="text-4xl font-bold mb-1" style={{ fontFamily: "var(--font-display)", color: "#00f0ff" }}>
            {avgScore || "—"}
          </div>
          <div className="text-sm text-gray-400">Avg Trust Score</div>
        </div>
        <div className="glass-strong rounded-xl p-5 border border-white/10 text-center">
          <div className="text-4xl font-bold mb-1" style={{ fontFamily: "var(--font-display)", color: "#8b5cf6" }}>
            {totalContributions}
          </div>
          <div className="text-sm text-gray-400">Total Contributions</div>
        </div>
      </div>

      {/* Trust Score + Submit Contribution */}
      <div className="grid lg:grid-cols-2 gap-6">
        <DevTrustScoreCard />
        <SubmitContribution />
      </div>

      {/* My Submissions */}
      <MySubmissionsPanel githubId={user.id} />

      {/* SBT Collection */}
      <div>
        <div className="flex items-center gap-2 mb-6">
          <Award className="w-5 h-5 text-[#00f0ff]" />
          <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Soulbound Token Vault
          </h2>
        </div>

        {roles.sbtTokens.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {roles.sbtTokens.map((token, i) => (
              <SBTCard key={token.id} token={token} index={i} />
            ))}
          </div>
        ) : (
          <div className="glass-strong rounded-2xl border border-white/10 p-16 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#00f0ff]/20 to-[#8b5cf6]/20 flex items-center justify-center mx-auto mb-4">
              <Award className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
              No SBTs Yet
            </h3>
            <p className="text-gray-400">Submit your first PR to start earning Soulbound Tokens</p>
          </div>
        )}
      </div>
    </div>
  );
}