// Lets the user share their groceries with other people (A4).
//   A4a: see who you share with   A4b: share with someone   A4c: stop sharing
import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../services/client";
import { listGrants, revokeGrant, shareWith, type Grant } from "../services/grants";
import "../styles/PantryPage.css";
import "../styles/SharingPage.css";

// Turns an error from the backend into a sentence the user can understand.
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
      return "No EatMe account uses that email.";
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SharingPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [email, setEmail] = useState("");
  const [sharing, setSharing] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const [revokingId, setRevokingId] = useState<number | null>(null);

  // Asks the backend for the list and puts it on screen.
  function loadGrants() {
    return listGrants()
      .then((rows) => {
        setGrants(rows);
        setListError("");
      })
      .catch((err: unknown) => setListError(shareError(err)))
      .finally(() => setLoading(false));
  }

  // Load the list once, when the page opens.
  useEffect(() => {
    listGrants()
      .then((rows) => setGrants(rows))
      .catch((err: unknown) => setListError(shareError(err)))
      .finally(() => setLoading(false));
  }, []);

  // A4b: share with the email that was typed in.
  async function handleShare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    setSuccess("");

    const typed = email.trim().toLowerCase();
    if (!typed) {
      setFormError("Enter the email of the person you want to share with.");
      return;
    }

    setSharing(true);
    try {
      await shareWith(typed);
      setSuccess(`Now sharing with ${typed}.`);
      setEmail("");
      await loadGrants();
    } catch (err) {
      setFormError(shareError(err));
    } finally {
      setSharing(false);
    }
  }

  // A4c: stop sharing with one person.
  async function handleRevoke(grant: Grant) {
    setFormError("");
    setSuccess("");
    setRevokingId(grant.grant_id);
    try {
      await revokeGrant(grant.grant_id);
      setSuccess(`Stopped sharing with ${grant.grantee_email}.`);
      await loadGrants();
    } catch (err) {
      setFormError(revokeError(err));
    } finally {
      setRevokingId(null);
    }
  }

  const active = grants.filter((g) => g.is_active);
  const stopped = grants.filter((g) => !g.is_active);

  return (
    <main className="pantry sharing">
      <h1 className="pantry-title">Sharing</h1>
      <p className="pantry-muted sharing-intro">
        People you share with can see and use your groceries. You can stop sharing at any time.
      </p>

      {/* A4b: share with someone */}
      <form className="pantry-row" onSubmit={handleShare} noValidate>
        <label htmlFor="share-email" className="visually-hidden">
          Email to share with
        </label>
        <input
          id="share-email"
          type="email"
          autoComplete="off"
          placeholder="roommate@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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

      {/* A4a: who you share with */}
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
          {active.map((g) => (
            <li key={g.grant_id} className="sharing-card">
              <div>
                <strong>
                  {g.grantee_first_name} {g.grantee_last_name}
                </strong>
                <span>{g.grantee_email}</span>
                <span>Since {formatDate(g.granted_at)}</span>
              </div>
              {/* A4c: stop sharing */}
              <button
                type="button"
                className="sharing-revoke"
                disabled={revokingId === g.grant_id}
                onClick={() => handleRevoke(g)}
              >
                {revokingId === g.grant_id ? "Stopping…" : "Stop sharing"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {stopped.length > 0 && (
        <>
          <h2 className="sharing-heading">Stopped sharing</h2>
          <ul className="pantry-list">
            {stopped.map((g) => (
              <li key={g.grant_id} className="sharing-card is-stopped">
                <div>
                  <strong>
                    {g.grantee_first_name} {g.grantee_last_name}
                  </strong>
                  <span>{g.grantee_email}</span>
                  <span>
                    Stopped {g.revoked_at ? formatDate(g.revoked_at) : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
