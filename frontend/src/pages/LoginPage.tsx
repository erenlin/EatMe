import { useState, type FormEvent } from "react";
import { ApiError } from "../services/client";
import { useAuth } from "../hooks/useAuth";
import "../styles/LoginPage.css";

const MESSAGES: Record<number, string> = {
  400: "Enter both your email and password.",
  401: "That email and password don't match an account.",
  405: "The login endpoint rejected this request method. Check the backend route.",
};

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError(MESSAGES[400]);
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(MESSAGES[err.status] ?? err.message);
      } else {
        setError("Can't reach the server. Make sure the backend is running.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <section className="login-panel">
        <h1 className="login-brand">EatMe</h1>
        <p className="login-tag">Use what you bought before it goes bad.</p>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
      </section>
    </main>
  );
}
