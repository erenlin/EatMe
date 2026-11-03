import { useEffect, useState, type ReactNode } from "react";
import { login as apiLogin, getMe, type User } from "../../services/client";
import { AuthContext } from "./authContext";
import { getToken, setToken, clearToken } from "../../services/tokenStore";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => getToken() !== null);

  // If a token was saved, ask /me who it belongs to. A bad or expired token gets cleared.
  useEffect(() => {
    if (!getToken()) return;
    getMe()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const token = await apiLogin(email, password);
    setToken(token);
    try {
      setUser(await getMe()); // proves the token actually works
    } catch (err) {
      clearToken();
      throw err;
    }
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
