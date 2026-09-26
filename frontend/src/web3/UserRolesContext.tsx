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