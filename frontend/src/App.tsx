import { AuthProvider } from "./features/auth/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import InventoryPage from "./pages/InventoryPage";
import RecipesPage from "./pages/RecipesPage";

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <LoginPage />;
  // TEMPORARY until React Router lands: /recipes shows Recipes, everything else My Groceries.
  return window.location.pathname === "/recipes" ? <RecipesPage /> : <InventoryPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
