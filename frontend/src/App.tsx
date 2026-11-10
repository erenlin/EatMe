// The top of the app: who's logged in, and which screen goes with which address.
//   /             My Groceries (Lory)        /add          Add by name
//   /recipes      Recipes (Lory)             /settings     Settings + Log out
//   /dictionary   Food dictionary (old items + variants page)
//   /sharing      Sharing (A4)
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from "react-router";
import BottomNav from "./components/BottomNav";
import { AuthProvider } from "./features/auth/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import AddPage from "./pages/AddPage";
import InventoryPage from "./pages/InventoryPage";
import LoginPage from "./pages/LoginPage";
import PantryPage from "./pages/PantryPage";
import RecipesPage from "./pages/RecipesPage";
import SettingsPage from "./pages/SettingsPage";
import SharingPage from "./pages/SharingPage";

// Main screens: the page on top, the bottom nav underneath.
function WithNav() {
  return (
    <div className="app-with-nav">
      <Outlet />
      <BottomNav />
    </div>
  );
}

// Placeholder for screens that aren't built yet.
function ComingSoon({ title }: { title: string }) {
  return (
    <main className="placeholder">
      <h1>{title}</h1>
      <p>Coming soon.</p>
      <Link to="/recipes">← Back to recipes</Link>
    </main>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <LoginPage />; // not logged in: every address shows the login screen

  return (
    <Routes>
      <Route element={<WithNav />}>
        <Route path="/" element={<InventoryPage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/:id" element={<ComingSoon title="Recipe details" />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/dictionary" element={<PantryPage />} />
        <Route path="/sharing" element={<SharingPage />} />
      </Route>

      {/* Full-screen, no bottom nav: it has its own back arrow. */}
      <Route path="/add" element={<AddPage />} />

      {/* Any other address goes to My Groceries. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
