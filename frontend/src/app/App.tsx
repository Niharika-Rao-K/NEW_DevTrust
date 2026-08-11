
import { useState, useRef, useEffect } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router";
import {useAccount} from "wagmi";
import { ConnectWalletButton } from "../web3/ConnectWalletButton";
import { DashboardSection } from "../web3/DashboardSection";
import { useGitHubAuth } from "../web3/GitHubAuth";
import { useUserRoles, type UserRoles } from "../web3/UserRolesContext";
import { DeveloperPage } from "../web3/DeveloperPage";
import { ReviewerPage } from "../web3/ReviewerPage";
import { CompanyPage } from "../web3/CompanyPage";
import {
  Wallet,
  GitBranch,
  Shield,
  Award,
  Code2,
  Sparkles,
  ChevronRight,
  Github,
  Twitter,
  MessageCircle,
  FileText,
  ArrowRight,
  CheckCircle,
  Zap,
  Users,
  TrendingUp,
  LogOut,
  UserCheck,
  ChevronDown,
} from "lucide-react";

// ─── GitHub User type ──────────────────────────────────────────────────────────
interface GitHubUser {
  id: string;
  login: string;
  avatar: string;
  name: string;
}

// ─── Profile Dropdown ──────────────────────────────────────────────────────────
function ProfileDropdown({
  user,
  roles,
  onRegisterDeveloper,
  onRegisterReviewer,
  onLogout,
  walletAddress,
  walletConnected,
}: {
  user: GitHubUser;
  roles: UserRoles;
  onRegisterDeveloper: () => void;
  onRegisterReviewer: () => void;
  onLogout: () => void;
  walletAddress?: string;
  walletConnected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const avatarFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    user.login
  )}&background=00f0ff&color=000`;

  return (
    <div ref={ref} className="relative">
      {/* Profile Button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 glass-strong px-3 py-2 rounded-lg border border-white/20 hover:border-[#00f0ff]/50 transition-all"
      >
        <img
          src={user.avatar || avatarFallback}
          alt={user.login}
          className="w-7 h-7 rounded-full border border-white/20"
          onError={(e) => {
            (e.target as HTMLImageElement).src = avatarFallback;
          }}
        />

        <span>{user.login}</span>

        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-64 glass-strong rounded-xl border border-white/20 shadow-2xl shadow-black/50 z-50 overflow-hidden">

          {/* User Information */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <img
                src={user.avatar || avatarFallback}
                alt={user.login}
                className="w-10 h-10 rounded-full border border-[#00f0ff]/30"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = avatarFallback;
                }}
              />

              <div>
                <div className="font-semibold text-sm">
                  {user.name || user.login}
                </div>

                <div className="text-xs text-gray-400">
                  @{user.login}
                </div>
              </div>
            </div>

            {/* Roles */}
            <div className="flex gap-2 mt-3 flex-wrap">
              {roles.isDeveloper && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/30">
                  Developer
                </span>
              )}

              {roles.isReviewer && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/30">
                  Reviewer
                </span>
              )}
            </div>
          </div>

          {/* Registration Options */}
          <div className="p-2 border-b border-white/10">

            {/* Developer */}
            {!roles.isDeveloper ? (
              <button
                onClick={() => {
                  onRegisterDeveloper();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#00f0ff]/10 transition-all group text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-[#00f0ff]/20 flex items-center justify-center group-hover:bg-[#00f0ff]/30 transition-all">
                  <Code2 className="w-4 h-4 text-[#00f0ff]" />
                </div>

                <div>
                  <div className="text-sm font-medium">
                    Register as Developer
                  </div>

                  <div className="text-xs text-gray-400">
                    Submit PRs & earn SBTs
                  </div>
                </div>
              </button>
            ) : (
              <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg opacity-60 cursor-default">
                <div className="w-8 h-8 rounded-lg bg-[#00f0ff]/10 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-[#00f0ff]" />
                </div>

                <div>
                  <div className="text-sm font-medium text-[#00f0ff]">
                    Developer ✓
                  </div>

                  <div className="text-xs text-gray-400">
                    {roles.sbtCount} SBTs earned
                  </div>
                </div>
              </div>
            )}

            {/* Reviewer */}
            {!roles.isReviewer ? (
              <button
                onClick={() => {
                  onRegisterReviewer();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#8b5cf6]/10 transition-all group text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-[#8b5cf6]/20 flex items-center justify-center group-hover:bg-[#8b5cf6]/30 transition-all">
                  <UserCheck className="w-4 h-4 text-[#8b5cf6]" />
                </div>

                <div>
                  <div className="text-sm font-medium">
                    Register as Reviewer
                  </div>

                  <div className="text-xs text-gray-400">
                    Stake & review PRs
                  </div>
                </div>
              </button>
            ) : (
              <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg opacity-60 cursor-default">
                <div className="w-8 h-8 rounded-lg bg-[#8b5cf6]/10 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-[#8b5cf6]" />
                </div>

                <div>
                  <div className="text-sm font-medium text-[#8b5cf6]">
                    Reviewer ✓
                  </div>

                  <div className="text-xs text-gray-400">
                    Active staker
                  </div>
                </div>
              </div>
            )}

            {/* Wallet Status */}
            <div className="mt-2 pt-2 border-t border-white/10">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    walletConnected
                      ? "bg-[#10b981]/20"
                      : "bg-gray-500/10"
                  }`}
                >
                  <Wallet
                    className={`w-4 h-4 ${
                      walletConnected
                        ? "text-[#10b981]"
                        : "text-gray-400"
                    }`}
                  />
                </div>

                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    Wallet
                  </div>

                  {walletConnected && walletAddress ? (
                    <div
                      className="text-xs text-[#10b981] truncate"
                      title={walletAddress}
                    >
                      {walletAddress}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400">
                      Not connected
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Logout */}
          <div className="p-2">
            <button
              onClick={() => {
                onLogout();
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 transition-all group text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <LogOut className="w-4 h-4 text-red-400" />
              </div>

              <div>
                <div className="text-sm font-medium text-red-400">
                  Logout
                </div>

                <div className="text-xs text-gray-500">
                  Disconnect GitHub session
                </div>
              </div>
            </button>
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Navbar ────────────────────────────────────────────────────────────────────
function Navbar() {
  const { user: githubUser, login: githubLogin, logout: githubLogout } = useGitHubAuth();
  const { roles: userRoles, registerDeveloper, registerReviewer } = useUserRoles();
  const { address, isConnected } = useAccount();
  const location = useLocation();

  const navTab = (to: string, label: string, activeColor: string) => {
    const isActive = location.pathname === to;
    return (
      <Link
        to={to}
        className={`text-sm font-medium px-4 py-2 rounded-lg transition-all ${
          isActive
            ? "text-white"
            : "text-gray-400 hover:text-white"
        }`}
        style={isActive ? { background: `${activeColor}20`, color: activeColor, border: `1px solid ${activeColor}40` } : {}}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="relative z-50 glass-strong border-b border-white/10 sticky top-0">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#8b5cf6] flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold" style={{ fontFamily: "var(--font-display)" }}>
              Dev<span className="gradient-text">Trust</span>
            </span>
          </Link>

          {/* Center nav links */}
          <div className="hidden md:flex items-center gap-2">
            <Link to="/" className={`text-sm px-3 py-2 rounded-lg transition-colors ${location.pathname === "/" ? "text-white" : "text-gray-400 hover:text-white"}`}>
              Home
            </Link>
            {/* Only show role tabs if logged in */}
            {githubUser && (
              <>
                {navTab("/developer", "Developer", "#00f0ff")}
                {navTab("/reviewer", "Reviewer", "#8b5cf6")}
                {navTab("/company", "Company", "#10b981")}
              </>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {!githubUser ? (
              <button
                onClick={githubLogin}
                className="flex items-center gap-2 glass-strong px-4 py-2 rounded-lg border border-white/20 hover:border-[#00f0ff]/50 hover:bg-white/10 transition-all group"
              >
                <Github className="w-4 h-4 group-hover:text-[#00f0ff] transition-colors" />
                <span className="text-sm font-medium">Login with GitHub</span>
              </button>
            ) : (
              <ProfileDropdown
                user={githubUser}
                roles={userRoles}
                onRegisterDeveloper={registerDeveloper}
                onRegisterReviewer={registerReviewer}
                onLogout={githubLogout}
                walletAddress={address}
                walletConnected={isConnected}
              />
            )}
            <ConnectWalletButton variant="nav" />
          </div>
        </div>
      </div>
    </nav>
  );
}

// ─── Landing Page ──────────────────────────────────────────────────────────────
function LandingPage() {
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const { user: githubUser, login: githubLogin } = useGitHubAuth();
  const navigate = useNavigate();

  return (
    <>
      {/* Hero Section */}
      <section className="relative z-10 pt-32 pb-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8 animate-slide-up">
              <div className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full">
                <Sparkles className="w-4 h-4 text-[#00f0ff]" />
                <span className="text-sm" style={{ fontFamily: "var(--font-mono)" }}>
                  Decentralized Developer Reputation
                </span>
              </div>

              <h1
                className="leading-[1.1]"
                style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.5rem, 6vw, 5rem)", fontWeight: 700 }}
              >
                Prove Your Skills.
                <br />
                <span className="gradient-text">Earn Trust On-Chain.</span>
              </h1>

              <p className="text-xl text-gray-400 max-w-xl leading-relaxed">
                A decentralized reputation system where developers are verified through real contributions, not resumes.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                {githubUser ? (
                  <button
                    onClick={() => navigate("/developer")}
                    className="px-8 py-4 rounded-lg font-semibold flex items-center gap-2 group transition-all hover:scale-105"
                    style={{ background: "linear-gradient(135deg, #00f0ff, #8b5cf6)", color: "#000" }}
                  >
                    Go to Dashboard <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                ) : (
                  <button
                    onClick={githubLogin}
                    className="flex items-center gap-2 px-8 py-4 rounded-lg font-semibold transition-all hover:scale-105"
                    style={{ background: "linear-gradient(135deg, #00f0ff, #8b5cf6)", color: "#000" }}
                  >
                    <Github className="w-5 h-5" />
                    Get Started with GitHub
                  </button>
                )}
                <button className="glass-strong px-8 py-4 rounded-lg hover:bg-white/10 transition-all flex items-center gap-2 group">
                  <span className="font-semibold">Explore Protocol</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

            {/* Hero Visualization */}
            <div className="relative animate-slide-up" style={{ animationDelay: "0.2s" }}>
              <div className="relative glass-strong rounded-2xl p-8 border border-white/20">
                <div className="aspect-square rounded-xl bg-gradient-to-br from-[#00f0ff]/20 to-[#8b5cf6]/20 p-8 relative overflow-hidden">
                  <div className="absolute inset-0 animate-gradient bg-gradient-to-r from-[#00f0ff]/10 via-[#8b5cf6]/10 to-[#f92b88]/10"></div>
                  <div className="relative z-10 flex flex-col items-center justify-center h-full">
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#8b5cf6] flex items-center justify-center mb-6 animate-float shadow-2xl shadow-[#00f0ff]/50">
                      <Shield className="w-16 h-16 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
                      Soulbound Token
                    </h3>
                    <p className="text-gray-400 text-center mb-6">Non-transferable proof of skill</p>
                    <div className="space-y-2 w-full">
                      {[
                        { label: "Skill Level", value: "Senior", color: "#00f0ff" },
                        { label: "Trust Score", value: "98/100", color: "#10b981" },
                        { label: "Contributions", value: "247", color: "#8b5cf6" },
                      ].map((item) => (
                        <div key={item.label} className="glass px-4 py-2 rounded-lg flex justify-between">
                          <span className="text-sm text-gray-400">{item.label}</span>
                          <span className="text-sm font-semibold" style={{ color: item.color }}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="relative z-10 py-24 px-6 bg-gradient-to-b from-transparent to-[#0d0d14]/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>
              The Broken <span className="gradient-text">Verification System</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Traditional hiring and credentialing systems are plagued with inefficiencies
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: FileText, title: "Resumes Can Be Misleading", desc: "Anyone can claim expertise without proof of actual work", color: "#ef4444" },
              { icon: Shield, title: "Centralized Verification Is Biased", desc: "Gatekeepers control who gets recognized, limiting opportunities", color: "#f97316" },
              { icon: Github, title: "GitHub Lacks Trust Validation", desc: "Commits don't prove quality or peer review—just activity", color: "#eab308" },
            ].map((problem, idx) => (
              <div key={idx} className="glass-strong rounded-xl p-6 hover:bg-white/5 transition-all group">
                <div
                  className="w-14 h-14 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
                  style={{ background: `linear-gradient(135deg, ${problem.color}40, ${problem.color}20)`, border: `1px solid ${problem.color}40` }}
                >
                  <problem.icon className="w-7 h-7" style={{ color: problem.color }} />
                </div>
                <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>{problem.title}</h3>
                <p className="text-gray-400 leading-relaxed">{problem.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-5xl font-bold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
                The <span className="gradient-text">DevTrust</span> Solution
              </h2>
              <p className="text-xl text-gray-400 leading-relaxed">
                A blockchain-based reputation system that validates developer skills through peer review and cryptographic proof.
              </p>
              <div className="space-y-4 pt-4">
                {[
                  { icon: Users, title: "Peer Staking Validates Code", desc: "Expert reviewers stake tokens on code quality, putting their reputation on the line" },
                  { icon: Shield, title: "Blockchain Ensures Transparency", desc: "All reviews and outcomes are permanently recorded on-chain for anyone to verify" },
                  { icon: Award, title: "Reputation Is Earned, Not Claimed", desc: "Soulbound tokens prove skills through validated contributions, not self-promotion" },
                ].map((solution, idx) => (
                  <div key={idx} className="flex gap-4 items-start group">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#00f0ff]/20 to-[#8b5cf6]/20 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <solution.icon className="w-6 h-6 text-[#00f0ff]" />
                    </div>
                    <div>
                      <h4 className="font-bold mb-1" style={{ fontFamily: "var(--font-display)" }}>{solution.title}</h4>
                      <p className="text-gray-400 text-sm leading-relaxed">{solution.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-strong rounded-2xl p-8 border border-white/20">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400" style={{ fontFamily: "var(--font-mono)" }}>SMART CONTRACT</span>
                  <span className="text-xs glass px-3 py-1 rounded-full text-[#10b981]">● VERIFIED</span>
                </div>
                <pre className="text-sm text-gray-300 overflow-x-auto" style={{ fontFamily: "var(--font-mono)" }}>
                  {`contract DevTrust {\n  mapping(address => uint) reputation;\n\n  function stakePR(\n    bytes32 prHash,\n    uint amount\n  ) external {\n    require(amount >= minStake);\n    // Verify reviewer credentials\n    // Lock tokens until validation\n  }\n\n  function validateOutcome(\n    bytes32 prHash,\n    bool success\n  ) external onlyOracle {\n    // Distribute rewards/penalties\n    // Update reputation scores\n    // Mint Soulbound Tokens\n  }\n}`}
                </pre>
                <div className="flex items-center gap-2 pt-2">
                  <CheckCircle className="w-5 h-5 text-[#10b981]" />
                  <span className="text-sm text-gray-400">Audited by OpenZeppelin</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative z-10 py-24 px-6 bg-gradient-to-b from-transparent to-[#0d0d14]/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>
              How It <span className="gradient-text">Works</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">Four simple steps from contribution to verified reputation</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: 1, icon: Code2, title: "Developer Submits PR", desc: "Submit your pull request to a participating open-source project" },
              { step: 2, icon: Users, title: "Reviewers Stake Tokens", desc: "Expert reviewers stake tokens based on their quality assessment" },
              { step: 3, icon: Github, title: "PR Outcome Verified", desc: "GitHub integration confirms merge status via oracle network" },
              { step: 4, icon: Award, title: "Rewards + SBTs Issued", desc: "Contributors earn tokens and non-transferable proof of skill" },
            ].map((step, idx) => (
              <div
                key={idx}
                className="relative group"
                onMouseEnter={() => setHoveredStep(idx)}
                onMouseLeave={() => setHoveredStep(null)}
              >
                <div className={`glass-strong rounded-xl p-6 h-full transition-all ${hoveredStep === idx ? "bg-white/10 border-[#00f0ff]" : ""}`}>
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#8b5cf6] flex items-center justify-center mb-4 shadow-lg shadow-[#00f0ff]/30 group-hover:scale-110 transition-transform">
                      <step.icon className="w-8 h-8 text-white" />
                    </div>
                    <div className="text-sm text-[#00f0ff] font-semibold mb-2" style={{ fontFamily: "var(--font-mono)" }}>STEP {step.step}</div>
                    <h4 className="font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>{step.title}</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
                {idx < 3 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-6 -translate-y-1/2 z-20">
                    <ChevronRight className="w-6 h-6 text-[#00f0ff]/50" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>
              Platform <span className="gradient-text">Features</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">Built for the next generation of developer credentialing</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Shield, title: "Decentralized Skill Verification", desc: "No central authority controls your reputation—it's validated by peers on-chain", gradient: "from-[#00f0ff] to-[#3b82f6]" },
              { icon: Zap, title: "Peer Staking Mechanism", desc: "Reviewers put skin in the game, ensuring high-quality, honest feedback", gradient: "from-[#8b5cf6] to-[#6366f1]" },
              { icon: Award, title: "Soulbound Tokens (SBTs)", desc: "Non-transferable proof of achievement that travels with your identity", gradient: "from-[#f92b88] to-[#ec4899]" },
              { icon: Github, title: "GitHub Integration", desc: "Seamlessly connects to your existing workflow and contribution history", gradient: "from-[#10b981] to-[#059669]" },
              { icon: TrendingUp, title: "On-chain Reputation Graph", desc: "Build a verifiable track record that compounds with every contribution", gradient: "from-[#f59e0b] to-[#d97706]" },
              { icon: Code2, title: "Smart Contract Automation", desc: "Trustless execution ensures fair reward distribution and security", gradient: "from-[#00f0ff] to-[#8b5cf6]" },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="glass-strong rounded-xl p-6 hover:bg-white/5 transition-all group cursor-pointer"
                onMouseEnter={() => setHoveredFeature(idx)}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                <div className={`w-14 h-14 rounded-lg bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Dashboard */}
      <DashboardSection />

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#8b5cf6] flex items-center justify-center">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  Dev<span className="gradient-text">Trust</span>
                </span>
              </div>
              <p className="text-gray-400 max-w-sm mb-4">
                Decentralized peer-staking protocol that verifies developer skills based on real open-source contributions.
              </p>
              <div className="flex gap-4">
                {[Github, Twitter, MessageCircle].map((Icon, i) => (
                  <a key={i} href="#" className="w-10 h-10 glass rounded-lg flex items-center justify-center hover:bg-white/10 transition-all">
                    <Icon className="w-5 h-5" />
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>Protocol</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                {["How It Works", "Stake & Review", "Soulbound Tokens", "Governance"].map((item) => (
                  <li key={item}><a href="#" className="hover:text-[#00f0ff] transition-colors">{item}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>Resources</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                {[
                  { label: "Documentation", icon: FileText },
                  { label: "GitHub", icon: Github },
                  { label: "Discord", icon: MessageCircle },
                ].map((item) => (
                  <li key={item.label}>
                    <a href="#" className="hover:text-[#00f0ff] transition-colors flex items-center gap-2">
                      <item.icon className="w-4 h-4" /> {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
            <div>© 2026 DevTrust Protocol. All rights reserved.</div>
            <div className="flex gap-6">
              {["Privacy Policy", "Terms of Service", "Security"].map((item) => (
                <a key={item} href="#" className="hover:text-[#00f0ff] transition-colors">{item}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0, 240, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.1) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }}
      />

      <div
        className="fixed bottom-0 right-0 w-[800px] h-[800px] bg-[#8b5cf6] opacity-20 blur-[150px] rounded-full translate-x-1/2 translate-y-1/2 animate-pulse pointer-events-none"
        style={{ animationDelay: "2s" }}
      />

      <div
        className="fixed top-1/2 left-1/2 w-[500px] h-[500px] bg-[#f92b88] opacity-15 blur-[100px] rounded-full -translate-x-1/2 -translate-y-1/2 animate-pulse pointer-events-none"
        style={{ animationDelay: "4s" }}
      />

      <Navbar />

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/developer" element={<DeveloperPage />} />
        <Route path="/reviewer" element={<ReviewerPage />} />
        <Route path="/company" element={<CompanyPage />} />
      </Routes>
    </div>
  );
}