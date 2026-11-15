import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { clearToken } from "../services/tokenStore";
import { checkSignup, type SignupFields } from "../utils/signup";

const valid: SignupFields = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  password: "correct-horse",
  confirm: "correct-horse",
  dateOfBirth: "2000-01-01",
  gender: "Others",
};

describe("checkSignup", () => {
  test("accepts a complete form", () => {
    expect(checkSignup(valid, "2026-11-15")).toBe("");
  });

  test.each<[string, Partial<SignupFields>, RegExp]>([
    ["missing name", { lastName: "  " }, /first and last name/],
    ["bad email", { email: "ada@" }, /valid email/],
    ["short password", { password: "short", confirm: "short" }, /at least 8/],
    ["mismatched passwords", { confirm: "different!" }, /don't match/],
    ["future birthday", { dateOfBirth: "2027-01-01" }, /future/],
    ["no gender", { gender: "" }, /Choose a gender/],
  ])("rejects %s", (_, change, message) => {
    expect(checkSignup({ ...valid, ...change }, "2026-11-15")).toMatch(message);
  });

  test("rejects passwords over bcrypt's 72-byte limit", () => {
    const long = "é".repeat(40); // 40 characters, 80 bytes
    expect(checkSignup({ ...valid, password: long, confirm: long }, "2026-11-15")).toMatch(
      /too long/,
    );
  });
});

describe("SignupPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearToken();
    window.history.pushState({}, "", "/");
  });

  test("login screen links to sign up", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("link", { name: "Create an account" }));
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
  });

  test("sends the account to POST /api/create, then logs in", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const bodies: Record<string, unknown> = {
        "/api/create": { id: 7 },
        "/api/login": { token: "t" },
        "/api/me": { username: "ada@example.com", user_id: 7 },
      };
      return new Response(JSON.stringify(bodies[url]), {
        status: url === "/api/create" ? 201 : 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/signup");
    render(<App />);

    await userEvent.type(screen.getByLabelText("First name"), "Ada");
    await userEvent.type(screen.getByLabelText("Last name"), "Lovelace");
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse");
    await userEvent.type(screen.getByLabelText("Confirm password"), "correct-horse");
    await userEvent.type(screen.getByLabelText("Date of birth"), "2000-01-01");
    await userEvent.click(screen.getByLabelText("Other"));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/create");
    expect(JSON.parse(init.body as string)).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      password: "correct-horse",
      date_of_birth: "2000-01-01",
      gender: "Others",
    });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/create",
      "/api/login",
      "/api/me",
    ]);
  });

  test("shows a clear message when the email is taken", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("an account with this email already exists", { status: 409 })),
    );
    window.history.pushState({}, "", "/signup");
    render(<App />);

    await userEvent.type(screen.getByLabelText("First name"), "Ada");
    await userEvent.type(screen.getByLabelText("Last name"), "Lovelace");
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse");
    await userEvent.type(screen.getByLabelText("Confirm password"), "correct-horse");
    await userEvent.type(screen.getByLabelText("Date of birth"), "2000-01-01");
    await userEvent.click(screen.getByLabelText("Female"));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/already exists/);
  });
});
