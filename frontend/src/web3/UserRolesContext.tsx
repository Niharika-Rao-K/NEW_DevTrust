import { createContext, useContext, useState, useEffect } from "react";
import { useGitHubAuth } from "./GitHubAuth";

export interface SBToken {
  id: number;
  name: string;
  skill: string;
  level: "Junior" | "Mid" | "Senior" | "Expert";
  score: number;
  contributions: number;
  color: string;
  gradient: string;
  icon: string;
  earnedAt: string;
}

export interface UserRoles {
  isDeveloper: boolean;
  isReviewer: boolean;
  sbtCount: number;
  sbtTokens: SBToken[];
}

interface UserRolesCtx {
  roles: UserRoles;
  registerDeveloper: () => void;
  registerReviewer: () => void;
}

const defaultRoles: UserRoles = {
  isDeveloper: false,
  isReviewer: false,
  sbtCount: 0,
  sbtTokens: [],
};

const MOCK_SBTS: SBToken[] = [
  {
    id: 1,
    name: "Solidity Architect",
    skill: "Smart Contracts",
    level: "Expert",
    score: 98,
    contributions: 247,
    color: "#00f0ff",
    gradient: "from-[#00f0ff] to-[#3b82f6]",
    icon: "◆",
    earnedAt: "Jan 2026",
  },
  {
    id: 2,
    name: "React Craftsman",
    skill: "Frontend Dev",
    level: "Senior",
    score: 94,
    contributions: 183,
    color: "#8b5cf6",
    gradient: "from-[#8b5cf6] to-[#6366f1]",
    icon: "⚛",
    earnedAt: "Feb 2026",
  },
  {
    id: 3,
    name: "Security Guardian",
    skill: "Audit & Security",
    level: "Mid",
    score: 87,
    contributions: 76,
    color: "#f92b88",
    gradient: "from-[#f92b88] to-[#ec4899]",
    icon: "🔐",
    earnedAt: "Mar 2026",
  },
  {
    id: 4,
    name: "Node Virtuoso",
    skill: "Backend Dev",
    level: "Senior",
    score: 91,
    contributions: 129,
    color: "#10b981",
    gradient: "from-[#10b981] to-[#059669]",
    icon: "⬢",
    earnedAt: "Apr 2026",
  },
];

// sessionStorage key — scoped so multiple GitHub users on the same browser don't collide
const storageKey = (githubId: string | number) => `devtrust_roles_${githubId}`;

const RolesContext = createContext<UserRolesCtx>({
  roles: defaultRoles,
  registerDeveloper: () => {},
  registerReviewer: () => {},
});

export function useUserRoles() {
  return useContext(RolesContext);
}

export function UserRolesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useGitHubAuth();

  // Load persisted roles for the current user, or fall back to defaults
  const loadRoles = (): UserRoles => {
    if (!user) return defaultRoles;
    try {
      const saved = sessionStorage.getItem(storageKey(user.id));
      if (saved) return JSON.parse(saved) as UserRoles;
    } catch {}
    return defaultRoles;
  };

  const [roles, setRoles] = useState<UserRoles>(loadRoles);

  // When the GitHub user changes (login / logout / different account), reload roles
  useEffect(() => {
    if (!user) {
      setRoles(defaultRoles);
    } else {
      setRoles(loadRoles());
    }
  }, [user?.id]);

  // Persist roles to sessionStorage whenever they change (and a user is logged in)
  useEffect(() => {
    if (!user) return;
    try {
      sessionStorage.setItem(storageKey(user.id), JSON.stringify(roles));
    } catch {}
  }, [roles, user?.id]);

  const registerDeveloper = () => {
    setRoles((prev: UserRoles) => ({
      ...prev,
      isDeveloper: true,
      sbtCount: MOCK_SBTS.length,
      sbtTokens: MOCK_SBTS,
    }));
  };

  const registerReviewer = () => {
    setRoles((prev: UserRoles) => ({ ...prev, isReviewer: true }));
  };

  return (
    <RolesContext.Provider value={{ roles, registerDeveloper, registerReviewer }}>
      {children}
    </RolesContext.Provider>
  );
}