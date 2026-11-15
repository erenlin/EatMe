// Sign up (A1): create an account, then log straight in.
// Uses the login screen's look (LoginPage.css) so the two feel like one flow.
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ApiError, createAccount, type Gender } from "../services/client";
import { useAuth } from "../hooks/useAuth";
import { checkSignup, MIN_PASSWORD, todayISO, type SignupFields } from "../utils/signup";
import "../styles/LoginPage.css";

type Fields = SignupFields;

const GENDERS: { value: Gender; label: string }[] = [
  { value: "Female", label: "Female" },
  { value: "Male", label: "Male" },
  { value: "Others", label: "Other" },
];

const MESSAGES: Record<number, string> = {
  400: "We couldn't create your account. Check your details and try again.",
  409: "An account with this email already exists. Try logging in instead.",
};

export default function SignupPage() {
  const { login } = useAuth();
  const [fields, setFields] = useState<Fields>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirm: "",
    dateOfBirth: "",
    gender: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const problem = checkSignup(fields);
    if (problem) {
      setError(problem);
      return;
    }

    setSubmitting(true);
    const email = fields.email.trim();
    try {
      await createAccount({
        first_name: fields.firstName.trim(),
        last_name: fields.lastName.trim(),
        email,
        password: fields.password,
        date_of_birth: fields.dateOfBirth,
        gender: fields.gender as Gender,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(MESSAGES[err.status] ?? err.message);
      } else {
        setError("Can't reach the server. Make sure the backend is running.");
      }
      setSubmitting(false);
      return;
    }

    // Account exists now; logging in swaps this screen for My Groceries.
    try {
      await login(email, fields.password);
    } catch {
      setError("Your account was created, but logging in failed. Try logging in.");
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <section className="login-panel">
        <h1 className="login-brand">EatMe</h1>
        <p className="login-tag">Create an account to start tracking your food.</p>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="first-name">First name</label>
          <input
            id="first-name"
            type="text"
            autoComplete="given-name"
            value={fields.firstName}
            onChange={(e) => set("firstName", e.target.value)}
          />

          <label htmlFor="last-name">Last name</label>
          <input
            id="last-name"
            type="text"
            autoComplete="family-name"
            value={fields.lastName}
            onChange={(e) => set("lastName", e.target.value)}
          />

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={fields.email}
            onChange={(e) => set("email", e.target.value)}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-describedby="password-hint"
            value={fields.password}
            onChange={(e) => set("password", e.target.value)}
          />
          <p id="password-hint" className="login-hint">
            At least {MIN_PASSWORD} characters.
          </p>

          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={fields.confirm}
            onChange={(e) => set("confirm", e.target.value)}
          />

          <label htmlFor="date-of-birth">Date of birth</label>
          <input
            id="date-of-birth"
            type="date"
            autoComplete="bday"
            max={todayISO()}
            value={fields.dateOfBirth}
            onChange={(e) => set("dateOfBirth", e.target.value)}
          />

          <fieldset className="login-radios">
            <legend>Gender</legend>
            {GENDERS.map((g) => (
              <label key={g.value} className="login-radio">
                <input
                  type="radio"
                  name="gender"
                  value={g.value}
                  checked={fields.gender === g.value}
                  onChange={() => set("gender", g.value)}
                />
                {g.label}
              </label>
            ))}
          </fieldset>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="login-switch">
          Already have an account? <Link to="/">Log in</Link>
        </p>
      </section>
    </main>
  );
}
