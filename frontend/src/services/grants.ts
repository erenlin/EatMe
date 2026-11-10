// Every sharing call (A4a, A4b, A4c) lives here, so SharingPage never builds URLs itself.
// It reuses request() from client.ts, which already attaches the login token.
import { request } from "./client";

// One row from GET /grants: someone the user has shared with.
export type Grant = {
  grant_id: number;
  grantee_user_id: number;
  grantee_first_name: string;
  grantee_last_name: string;
  grantee_email: string;
  granted_at: string; // ISO date, e.g. "2026-11-08T17:51:00Z"
  revoked_at: string | null; // null while the share is still active
  is_active: boolean;
};

// A4a: everyone the user has shared with. The backend already sorts it:
// active shares first (newest first), then stopped ones. We keep that order.
export async function listGrants(): Promise<Grant[]> {
  const data = await request<Grant[] | null>("/api/grants");
  return data ?? [];
}

// A4b: share with another user, found by their email.
export function shareWith(email: string): Promise<unknown> {
  return request("/api/grants", {
    method: "POST",
    body: { grantee_email: email },
  });
}

// A4c: stop sharing with someone. The share stays in the list, marked as stopped.
export function revokeGrant(grantId: number): Promise<unknown> {
  return request(`/api/grants/${grantId}/revoke`, { method: "POST" });
}
