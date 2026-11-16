// Settings: links to the other screens, plus Log out.
import { Link } from "react-router";
import { useAuth } from "../hooks/useAuth";
import "../styles/SettingsPage.css";

export default function SettingsPage() {
  const { logout } = useAuth();

  return (
    <main className="settings">
      <h1 className="settings-title">Settings</h1>

      <ul className="settings-list">
        <li>
          <Link to="/dictionary" className="settings-row">
            <strong>Saved foods</strong>
            <span>Foods you've added before and their types</span>
          </Link>
        </li>
        <li>
          <Link to="/sharing" className="settings-row">
            <strong>Sharing</strong>
            <span>Share your groceries with someone</span>
          </Link>
        </li>
      </ul>

      <button type="button" className="settings-logout" onClick={logout}>
        Log out
      </button>
    </main>
  );
}
