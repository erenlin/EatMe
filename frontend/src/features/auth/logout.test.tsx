import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { clearToken, setToken } from "../../services/tokenStore";

afterEach(() => {
  vi.unstubAllGlobals();
  clearToken();
  window.history.pushState({}, "", "/");
});

test("logging out from Settings goes back to /, so the next login opens My Groceries", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      new Response(JSON.stringify(url === "/api/me" ? { username: "a@b.co", user_id: 1 } : []), {
        status: 200,
      }),
    ),
  );
  setToken("t");
  window.history.pushState({}, "", "/settings");
  render(<App />);

  await userEvent.click(await screen.findByRole("button", { name: /log out/i }));
  expect(window.location.pathname).toBe("/");
});
