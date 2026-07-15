import { createContext, useContext, useEffect, useState } from "react";
import { Github, Loader2, LogOut, Shield } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitHubUser {
  id: string;
  login: string;
  avatar: string;
  name: string;
}

interface AuthCtx {
  user: GitHubUser | null;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthCtx>({
  user: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

export function useGitHubAuth() {
  return useContext(AuthContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function GitHubAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if GitHub just redirected back with user params in the URL
    const params = new URLSearchParams(window.location.search);
    const github_id = params.get("github_id");
    const auth_error = params.get("auth_error");

    if (auth_error) {
      console.error("GitHub OAuth failed");
      window.history.replaceState({}, "", window.location.pathname);
      setIsLoading(false);
      return;
    }

    if (github_id) {
      const ghUser: GitHubUser = {
        id: github_id,
        login: params.get("github_login") ?? "",
        avatar: params.get("github_avatar") ?? "",
        name: params.get("github_name") ?? "",
      };
      setUser(ghUser);
      // Store in sessionStorage so a page refresh keeps the user logged in
      sessionStorage.setItem("github_user", JSON.stringify(ghUser));
      // Clean the URL so params don't show in the address bar
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      // Try restoring from a previous session
      const stored = sessionStorage.getItem("github_user");
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch {
          sessionStorage.removeItem("github_user");
        }
      }
    }

    setIsLoading(false);
  }, []);

  const login = () => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
    window.location.href = `${backendUrl}/auth/github`;
  };

  const logout = () => {
    sessionStorage.removeItem("github_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── GitHub Auth Gate ─────────────────────────────────────────────────────────
// Wrap any section with this component to block access until GitHub is connected

export function GitHubAuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, login } = useGitHubAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-[#00f0ff] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-lg mx-auto text-center">
          <div
            className="glass-strong rounded-2xl p-12 border"
            style={{ borderColor: "rgba(0,240,255,0.2)" }}
          >
            {/* Shield icon */}
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{
                background: "linear-gradient(135deg, rgba(0,240,255,0.15), rgba(139,92,246,0.15))",
                border: "1px solid rgba(0,240,255,0.3)",
              }}
            >
              <Shield className="w-10 h-10 text-[#00f0ff]" />
            </div>

            <h2
              className="text-2xl font-bold text-white mb-3"
              style={{ fontFamily: "var(--font-display)" }}
            >
              GitHub Authentication Required
            </h2>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              DevTrust verifies your identity through GitHub before you can stake
              or submit contributions. This ensures every reputation is tied to a
              real developer account.
            </p>

            <button
              onClick={login}
              className="w-full py-4 px-6 rounded-xl font-bold flex items-center justify-center gap-3 transition-all active:scale-95 hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #00f0ff, #8b5cf6)",
                color: "#0a0a0f",
              }}
            >
              <Github className="w-5 h-5" />
              Continue with GitHub
            </button>

            <p className="text-xs text-gray-600 mt-5">
              Only your public profile is accessed. We never store your email or
              private data.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // User is authenticated — render children normally
  return <>{children}</>;
}

// ─── GitHub User Badge ────────────────────────────────────────────────────────
// Drop this anywhere in the nav to show the logged-in user's avatar + logout

export function GitHubUserBadge() {
  const { user, logout } = useGitHubAuth();
  if (!user) return null;

  return (
    <div
      className="flex items-center gap-2 glass px-3 py-2 rounded-xl"
      style={{ border: "1px solid rgba(255,255,255,0.1)" }}
    >
      <img
        src={user.avatar}
        alt={user.login}
        className="w-7 h-7 rounded-full border border-white/20"
      />
      <span className="text-sm text-white font-medium hidden sm:block">
        @{user.login}
      </span>
      <button
        onClick={logout}
        title="Logout from GitHub"
        className="text-gray-500 hover:text-red-400 transition-colors ml-1"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}