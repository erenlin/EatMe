import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import SharingPage from "./SharingPage";
import { listGrants, revokeGrant, shareWith, type Grant } from "../services/grants";

vi.mock("../services/grants", () => ({
  listGrants: vi.fn(),
  revokeGrant: vi.fn(),
  shareWith: vi.fn(),
}));

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    user: { user_id: 6, username: "test@example.com" },
  }),
}));

const active: Grant = {
  grant_id: 10,
  grantee_user_id: 21,
  grantee_first_name: "Kinza",
  grantee_last_name: "2.0",
  grantee_email: "friend@example.com",
  granted_at: "2026-11-20T00:00:00Z",
  revoked_at: null,
  is_active: true,
};

const stopped: Grant = {
  ...active,
  revoked_at: "2026-11-20T01:00:00Z",
  is_active: false,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SharingPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("sharing permission checkboxes", () => {
  test("unchecking revokes access and checking again restores it", async () => {
    vi.mocked(listGrants)
      .mockResolvedValueOnce([active])
      .mockResolvedValueOnce([stopped])
      .mockResolvedValueOnce([
        { ...active, grant_id: 11 },
        stopped,
      ]);

    vi.mocked(revokeGrant).mockResolvedValue(undefined);
    vi.mocked(shareWith).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Share groceries with Kinza 2.0",
    });

    expect((checkbox as HTMLInputElement).checked).toBe(true);

    await user.click(checkbox);

    await waitFor(() => {
      expect(revokeGrant).toHaveBeenCalledWith(10);
      expect((checkbox as HTMLInputElement).checked).toBe(false);
      expect(screen.getByText("Not sharing")).toBeTruthy();
    });

    await user.click(checkbox);

    await waitFor(() => {
      expect(shareWith).toHaveBeenCalledWith(21);
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    });
  });

  test("does not show duplicate cards for previous grants", async () => {
    vi.mocked(listGrants).mockResolvedValue([
      { ...active, grant_id: 11 },
      stopped,
    ]);

    renderPage();

    await screen.findByRole("checkbox", {
      name: "Share groceries with Kinza 2.0",
    });

    expect(
      screen.getAllByRole("checkbox", {
        name: "Share groceries with Kinza 2.0",
      }),
    ).toHaveLength(1);
  });

  test("preserves sharing when revocation fails", async () => {
    vi.mocked(listGrants).mockResolvedValue([active]);
    vi.mocked(revokeGrant).mockRejectedValue(
      new Error("Connection failed"),
    );

    const user = userEvent.setup();
    renderPage();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Share groceries with Kinza 2.0",
    });

    await user.click(checkbox);

    await waitFor(() => {
      expect(revokeGrant).toHaveBeenCalledWith(10);
      expect(screen.getByRole("alert")).toBeTruthy();
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    });
  });
});
