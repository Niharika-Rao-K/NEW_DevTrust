// ReviewerPage.tsx
// Uses the full ReviewerPage from DashboardSection (has staking, search, projects, manual entry)

import { ReviewerPage as ReviewerPageContent } from "./DashboardSection";
import { GitHubAuthGate } from "./GitHubAuth";
import { useGitHubAuth } from "./GitHubAuth";
import { useUserRoles } from "./UserRolesContext";
import { Shield, UserCheck, AlertCircle } from "lucide-react";

function ReviewerGate({ onRegister }: { onRegister: () => void }) {
  const { user } = useGitHubAuth();
  const { roles } = useUserRoles();

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="glass-strong rounded-2xl border border-white/10 p-12 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#8b5cf6]/20 to-[#6366f1]/20 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Login Required
          </h3>
          <p className="text-gray-400 mb-6">
            Sign in with GitHub to access the Reviewer dashboard.
          </p>
          <div className="flex items-center gap-2 justify-center text-sm text-yellow-400">
            <AlertCircle className="w-4 h-4" />
            Use the GitHub login button in the navbar
          </div>
        </div>
      </div>
    );
  }

  if (!roles.isReviewer) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="glass-strong rounded-2xl border border-white/10 p-12 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#8b5cf6]/20 to-[#6366f1]/20 flex items-center justify-center mx-auto mb-4">
            <UserCheck className="w-8 h-8 text-[#8b5cf6]" />
          </div>
          <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Register as Reviewer
          </h3>
          <p className="text-gray-400 mb-8">
            Become a reviewer to stake ETH on PR quality and earn rewards for accurate assessments.
          </p>
          <button
            onClick={onRegister}
            className="px-8 py-3 rounded-lg font-semibold transition-all hover:scale-105"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", color: "#fff" }}
          >
            Register Now
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export function ReviewerPage() {
  const { roles, registerReviewer } = useUserRoles();
  const { user } = useGitHubAuth();

  if (!user || !roles.isReviewer) {
    return (
      <GitHubAuthGate>
        <ReviewerGate onRegister={registerReviewer} />
      </GitHubAuthGate>
    );
  }

  // Render the full reviewer UI from DashboardSection
  return (
    <div className="relative z-10 py-12 px-6 max-w-6xl mx-auto">
      <ReviewerPageContent />
    </div>
  );
}