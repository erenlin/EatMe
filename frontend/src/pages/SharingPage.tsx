// Lets the user share their groceries with other people (A4).
//   A4a: see who you share with   A4b: share by user ID   A4c: stop sharing
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ApiError } from "../services/client";
import { useAuth } from "../hooks/useAuth";
import { listGrants, revokeGrant, shareWith, type Grant } from "../services/grants";
import "../styles/PantryPage.css";
import "../styles/SharingPage.css";

function shareError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return "Can't reach the server. Make sure the backend is running.";
  }
  switch (err.status) {
    case 400:
      return "You can't share with yourself.";
    case 401:
      return "Your session expired. Please log in again.";
    case 404:
      return "No EatMe account with that ID.";
    case 409:
      return "You're already sharing with this person.";
    default:
      return err.message;
  }
}

function revokeError(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return "You already stopped sharing with them.";
  if (err instanceof ApiError && err.status === 404) return "That share wasn't found.";
  return shareError(err);
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function SharingPage() {
  const { user } = useAuth();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [userIdInput, setUserIdInput] = useState("");
  const [sharing, setSharing] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const [revokingId, setRevokingId] = useState<number | null>(null);

  function loadGrants() {
    return listGrants()
      .then((rows) => {
        setGrants(rows);
        setListError("");
      })
      .catch((err: unknown) => setListError(shareError(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadGrants();
  }, []);

  async function handleShare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    setSuccess("");

    const id = parseInt(userIdInput.trim(), 10);
    if (!id || id <= 0) {
      setFormError("Enter a valid user ID.");
      return;
    }

    setSharing(true);
    try {
      await shareWith(id);
      setSuccess(`Now sharing with user #${id}.`);
      setUserIdInput("");
      await loadGrants();
    } catch (err) {
      setFormError(shareError(err));
    } finally {
      setSharing(false);
    }
  }

  async function handleRevoke(grant: Grant) {
    setFormError("");
    setSuccess("");
    setRevokingId(grant.grant_id);
    try {
      await revokeGrant(grant.grant_id);
      setSuccess(`Stopped sharing with ${grant.grantee_first_name}.`);
      await loadGrants();
    } catch (err) {
      setFormError(revokeError(err));
    } finally {
      setRevokingId(null);
    }
  }

  const active = grants.filter((g) => g.is_active);

  return (
    <main className="pantry sharing">
      <Link to="/settings" className="sharing-back">
        ← Settings
      </Link>
      <h1 className="pantry-title">Sharing</h1>

      {/* Show own user ID so others can share with this user */}
      {user && (
        <p className="sharing-own-id">
          Your user ID: <strong>#{user.user_id}</strong>
        </p>
      )}

      <p className="pantry-muted sharing-intro">
        Share your groceries by entering another person's user ID.
        They can see and use your groceries until you stop sharing.
      </p>

      {/* A4b: share with someone by user ID */}
      <form className="pantry-row sharing-form" onSubmit={handleShare} noValidate>
        <label htmlFor="share-id" className="visually-hidden">
          User ID to share with
        </label>
        <input
          id="share-id"
          required
          aria-required="true"
          type="number"
          min="1"
          inputMode="numeric"
          autoComplete="off"
          placeholder="User ID"
          value={userIdInput}
          onChange={(e) => setUserIdInput(e.target.value)}
        />
        <button type="submit" disabled={sharing}>
          {sharing ? "Sharing…" : "Share"}
        </button>
      </form>

      {formError && (
        <p className="pantry-error" role="alert">
          {formError}
        </p>
      )}
      {success && (
        <p className="sharing-success" role="status">
          {success}
        </p>
      )}

      {/* A4a: active shares only */}
      <h2 className="sharing-heading">Sharing with</h2>
      {listError && (
        <p className="pantry-error" role="alert">
          {listError}
        </p>
      )}

      {loading ? (
        <p className="pantry-muted">Loading…</p>
      ) : active.length === 0 ? (
        <p className="pantry-muted">You're not sharing with anyone yet.</p>
      ) : (
        <ul className="pantry-list">
          {active.map((g) => {
            const days = daysSince(g.granted_at);
            const daysLabel = days === 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`;
            return (
              <li key={g.grant_id} className="sharing-card">
                <div className="sharing-card-info">
                  <span className="sharing-card-id">#{g.grantee_user_id}</span>
                  <strong className="sharing-card-name">
                    {g.grantee_first_name} {g.grantee_last_name}
                  </strong>
                  <span className="sharing-card-email">{g.grantee_email}</span>
                  <span className="sharing-card-since">{daysLabel}</span>
                </div>
                {/* A4c: stop sharing */}
                <button
                  type="button"
                  className="sharing-revoke"
                  aria-label={`Stop sharing with ${g.grantee_first_name}`}
                  disabled={revokingId === g.grant_id}
                  onClick={() => handleRevoke(g)}
                >
                  {revokingId === g.grant_id ? "…" : "✕"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
