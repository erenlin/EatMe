import { describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import InventoryPage from "./InventoryPage";
import { listSharedInstances, type SharedInstance } from "../services/instances";

vi.mock("../services/instances", () => ({
  listAllInstances: vi.fn().mockResolvedValue([]),
  listSharedInstances: vi.fn().mockResolvedValue([]),
  consumeInstance: vi.fn(),
}));

vi.mock("../services/items", () => ({
  lookupItems: vi.fn().mockResolvedValue([]),
}));

describe("Inventory sharing views", () => {
  test("switches between personal and shared groceries", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", {
      name: "Your fridge is empty!",
    });

    expect(screen.getByRole("searchbox")).toBeTruthy();
    expect(screen.getByRole("link", { name: "+ Add" })).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Shared with me" }),
    );

    expect(
      screen.getByRole("heading", { name: "Shared with me" }),
    ).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("link", { name: "+ Add" })).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "My groceries" }),
    );

    expect(screen.getByRole("searchbox")).toBeTruthy();
    expect(screen.getByRole("link", { name: "+ Add" })).toBeTruthy();
  });
});


test("displays a shared grocery with its owner's name", async () => {
  vi.mocked(listSharedInstances).mockResolvedValueOnce([{
    instance_id: 90,
    user_id: 6,
    variant_id: 30,
    owner_name: "Test Owner",
    item_name: "Sharing Test Kiwi",
    variant_name: "Organic",
    quantity: 1,
    unit_weight_grams: 100,
    store_mode: "fridge",
    total_grams: 100,
    grams_remaining: 100,
    added_at: "2026-11-19T00:00:00Z",
    expires_at: null,
  }]);

  render(
    <MemoryRouter>
      <InventoryPage />
    </MemoryRouter>,
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Shared with me" }),
  );

  expect(
    await screen.findByText("Shared by Test Owner (#6)"),
  ).toBeTruthy();

  expect(screen.getByText("Sharing Test Kiwi ×1")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Use" })).toBeNull();
});


test("shows an error when shared groceries fail to load", async () => {
  vi.mocked(listSharedInstances).mockRejectedValueOnce(
    new Error("Service unavailable"),
  );

  render(
    <MemoryRouter>
      <InventoryPage />
    </MemoryRouter>,
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Shared with me" }),
  );

  expect((await screen.findByRole("alert")).textContent)
    .toContain("Can't reach the server");
  expect(screen.queryByText("No shared groceries to show right now."))
    .toBeNull();
});

test("ignores an outdated shared inventory response", async () => {
  let resolveFirst!: (rows: SharedInstance[]) => void;
  const pending = new Promise<SharedInstance[]>((resolve) => {
    resolveFirst = resolve;
  });

  vi.mocked(listSharedInstances)
    .mockReturnValueOnce(pending)
    .mockResolvedValueOnce([]);

  const user = userEvent.setup();

  render(
    <MemoryRouter>
      <InventoryPage />
    </MemoryRouter>,
  );

  await user.click(
    screen.getByRole("button", { name: "Shared with me" }),
  );
  await user.click(
    screen.getByRole("button", { name: "My groceries" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Shared with me" }),
  );

  expect(await screen.findByText("No shared groceries to show right now."))
    .toBeTruthy();

  await act(async () => {
    resolveFirst([{
      instance_id: 99,
      user_id: 6,
      variant_id: 40,
      owner_name: "Old Owner",
      item_name: "Old Apple",
      variant_name: "Regular",
      quantity: 1,
      unit_weight_grams: 150,
      store_mode: "fridge",
      total_grams: 150,
      grams_remaining: 150,
      added_at: "2026-11-19T00:00:00Z",
      expires_at: null,
    }]);
  });

  expect(screen.queryByText("Shared by Old Owner (#6)")).toBeNull();
});

test("falls back to the user ID when an owner has no valid name", async () => {
  vi.mocked(listSharedInstances).mockResolvedValueOnce([{
    instance_id: 99,
    user_id: 17,
    variant_id: 40,
    owner_name: "null null",
    item_name: "Apple",
    variant_name: "Regular",
    quantity: 1,
    unit_weight_grams: 150,
    store_mode: "fridge",
    total_grams: 150,
    grams_remaining: 150,
    added_at: "2026-11-20T00:00:00Z",
    expires_at: null,
  }]);

  const user = userEvent.setup();

  render(
    <MemoryRouter>
      <InventoryPage />
    </MemoryRouter>,
  );

  await user.click(
    screen.getByRole("button", { name: "Shared with me" }),
  );

  expect(
    await screen.findByText("Shared by user #17"),
  ).toBeTruthy();

  expect(screen.queryByText(/null null/)).toBeNull();
});
