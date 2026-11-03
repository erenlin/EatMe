import { AuthProvider } from "./features/auth/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";

function Home() {
  const { user, logout } = useAuth();
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Logged in</h1>
      <pre>{JSON.stringify(user, null, 2)}</pre>
      <button onClick={logout}>Log out</button>
    </main>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Home /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}