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

  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);
  const [togglingTo, setTogglingTo] = useState(false);

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

  async function handleToggle(grant: Grant, checked: boolean) {
    if (togglingUserId !== null) return;

    setTogglingUserId(grant.grantee_user_id);
    setTogglingTo(checked);
    setFormError("");
    setSuccess("");

    try {
      if (checked) {
        await shareWith(grant.grantee_user_id);
      } else {
        await revokeGrant(grant.grant_id);
      }

      await loadGrants();
      setSuccess(
        checked
          ? `Now sharing with ${grant.grantee_first_name}.`
          : `Stopped sharing with ${grant.grantee_first_name}.`,
      );
    } catch (err) {
      setFormError(checked ? shareError(err) : revokeError(err));
    } finally {
      setTogglingUserId(null);
    }
  }

  // The API returns active grants first, then revoked history.
  // Keep the first record for each person so previous shares don't duplicate.
  const people = grants.filter(
    (g, index) =>
      grants.findIndex(
        (other) => other.grantee_user_id === g.grantee_user_id,
      ) === index,
  );

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
        Use the checkboxes below to control who can see your groceries.
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
        <button type="submit" disabled={sharing || togglingUserId !== null}>
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

      <h2 className="sharing-heading">Sharing access</h2>
      {listError && (
        <p className="pantry-error" role="alert">
          {listError}
        </p>
      )}

      {loading ? (
        <p className="pantry-muted">Loading…</p>
      ) : listError ? null : people.length === 0 ? (
        <p className="pantry-muted">You haven't shared with anyone yet.</p>
      ) : (
        <ul className="pantry-list">
          {people.map((g) => {
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
                  <span className="sharing-card-since">
                    {g.is_active ? daysLabel : "Not sharing"}
                  </span>
                </div>
                <label className="sharing-toggle">
                  <input
                    type="checkbox"
                    className="sharing-checkbox"
                    aria-label={`Share groceries with ${g.grantee_first_name} ${g.grantee_last_name}`}
                    checked={
                      togglingUserId === g.grantee_user_id
                        ? togglingTo
                        : g.is_active
                    }
                    disabled={togglingUserId !== null || sharing}
                    onChange={(e) => {
                      void handleToggle(g, e.target.checked);
                    }}
                  />
                  <span className="sharing-toggle-state">
                    {togglingUserId === g.grantee_user_id
                      ? "Updating…"
                      : g.is_active ? "On" : "Off"}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
