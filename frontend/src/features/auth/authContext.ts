import { createContext } from "react";
import type { User } from "../../services/client";

export type AuthValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthValue | null>(null);