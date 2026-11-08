import { useState } from "react";
import { AuthProvider } from "./features/auth/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import PantryPage from "./pages/PantryPage";
import SharingPage from "./pages/SharingPage";
import "./styles/AppNav.css";

type Screen = "pantry" | "sharing";

// The tabs at the top once you're logged in.
function Nav({ screen, onChange }: { screen: Screen; onChange: (s: Screen) => void }) {
  return (
    <nav className="app-nav" aria-label="Main">
      <button
        type="button"
        aria-current={screen === "pantry" ? "page" : undefined}
        onClick={() => onChange("pantry")}
      >
        My Groceries
      </button>
      <button
        type="button"
        aria-current={screen === "sharing" ? "page" : undefined}
        onClick={() => onChange("sharing")}
      >
        Sharing
      </button>
    </nav>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  const [screen, setScreen] = useState<Screen>("pantry");
  if (loading) return null;
  if (!user) return <LoginPage />;
  return (
    <>
      <Nav screen={screen} onChange={setScreen} />
      {screen === "pantry" ? <PantryPage /> : <SharingPage />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
