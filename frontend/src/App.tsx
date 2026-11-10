// The top of the app: who's logged in, and which screen goes with which address.
//   /             My Groceries (Lory)        /add          Add by name
//   /recipes      Recipes (Lory)             /settings     Settings + Log out
//   /recipes/:id  Recipe details + ingredients (D2)
//   /groceries/:id                       One grocery: details, use some, delete
//   /dictionary                          Food dictionary: your items
//   /dictionary/:itemId                  One item's variants (B1b, B2b)
//   /dictionary/:itemId/variants/:vid    One variant + what's in the fridge (C1)
//   /sharing      Sharing (A4)
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import BottomNav from "./components/BottomNav";
import { AuthProvider } from "./features/auth/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import AddPage from "./pages/AddPage";
import GroceryDetailPage from "./pages/GroceryDetailPage";
import InventoryPage from "./pages/InventoryPage";
import LoginPage from "./pages/LoginPage";
import PantryPage from "./pages/PantryPage";
import RecipeDetailPage from "./pages/RecipeDetailPage";
import RecipesPage from "./pages/RecipesPage";
import SettingsPage from "./pages/SettingsPage";
import SharingPage from "./pages/SharingPage";
import VariantDetailPage from "./pages/VariantDetailPage";
import VariantsPage from "./pages/VariantsPage";

// Main screens: the page on top, the bottom nav underneath.
function WithNav() {
  return (
    <div className="app-with-nav">
      <Outlet />
      <BottomNav />
    </div>
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
        <Route path="/groceries/:id" element={<GroceryDetailPage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/dictionary" element={<PantryPage />} />
        <Route path="/dictionary/:itemId" element={<VariantsPage />} />
        <Route path="/dictionary/:itemId/variants/:variantId" element={<VariantDetailPage />} />
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
