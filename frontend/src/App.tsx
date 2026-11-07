import { AuthProvider } from "./features/auth/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import PantryPage from "./pages/PantryPage";

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <PantryPage /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}