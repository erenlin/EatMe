import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../services/client";
import { lookupItems, createItem, type Item } from "../services/items";
import "../styles/PantryPage.css";

const MESSAGES: Record<number, string> = {
  400: "Please enter an item name.",
  401: "Your session expired. Please log in again.",
  409: "You already have that item.",
};

// Turns any error into a sentence we can show on screen.
function messageFor(err: unknown): string {
  if (err instanceof ApiError) return MESSAGES[err.status] ?? err.message;
  return "Can't reach the server. Make sure the backend is running.";
}

export default function PantryPage() {
  // ---- Sticky notes (what the page remembers) ----
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState(""); // text in the search bar
  const [activeSearch, setActiveSearch] = useState(""); // the search that was last run
  const [addItemWord, setAddItemWord] = useState(""); // text in the add box
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  // ---- Load every item once, when the page opens ----
  useEffect(() => {
    lookupItems("")
      .then((result) => setItems(result ?? []))
      .catch((err) => setError(messageFor(err)))
      .finally(() => setLoading(false));
  }, []);

  // ---- Search: ask the backend for matching items ----
  async function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const query = search.trim();
      const result = await lookupItems(query);
      setItems(result ?? []);
      setActiveSearch(query);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }

  // ---- Add: send the new name, then refresh the list ----
  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const name = addItemWord.trim();
    if (!name) {
      setError(MESSAGES[400]);
      return;
    }
    setAdding(true);
    try {
      await createItem(name);
      setAddItemWord("");
      // Reload so the list shows exactly what the database has.
      const result = await lookupItems(activeSearch);
      setItems(result ?? []);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setAdding(false);
    }
  }

  // ---- What you see ----
  return (
    <main className="pantry">
      <h1 className="pantry-title">My Groceries</h1>

      <form className="pantry-row" onSubmit={handleSearch} role="search">
        <label htmlFor="search" className="visually-hidden">Search groceries</label>
        <input
          id="search"
          type="search"
          placeholder="Search groceries"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="pantry-button-secondary">Search</button>
      </form>

      <form className="pantry-row" onSubmit={handleAdd}>
        <label htmlFor="add-item" className="visually-hidden">Item name</label>
        <input
          id="add-item"
          type="text"
          placeholder="e.g. Apple"
          value={addItemWord}
          onChange={(e) => setAddItemWord(e.target.value)}
        />
        <button type="submit" disabled={adding}>
          {adding ? "Adding…" : "Add"}
        </button>
      </form>

      {error && (
        <p className="pantry-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="pantry-muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="pantry-empty">
          {activeSearch ? (
            <>
              <h2>No matches found!</h2>
              <p>Try looking for another item…</p>
            </>
          ) : (
            <>
              <h2>Your fridge is empty!</h2>
              <p>Add your first grocery and we'll remind you before it goes bad.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="pantry-list">
          {items.map((item) => (
            <li key={item.item_id} className="pantry-item">
              {item.item_name}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}