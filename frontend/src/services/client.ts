// Every backend call goes through here, so the JWT and error handling live in one place.
import { getToken } from "./tokenStore";

// Check router.go for the create path: the doc says /users/create, Ava's update says /create.
export const ENDPOINTS = {
  login: "/api/login",
  me: "/api/me",
  createUser: "/api/create",
  health: "/api/health",
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

export async function request<T = unknown>(
  path: string,
  { method = "GET", body, auth = true }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    const message =
      (typeof data?.error === "string" && data.error) ||
      (typeof data?.message === "string" && data.message) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

type LoginResponse = { token?: string; jwt?: string; access_token?: string };

export async function login(email: string, password: string): Promise<string> {
  const data = await request<LoginResponse>(ENDPOINTS.login, {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  // Once you see the real response, keep only the right field name.
  const token = data?.token ?? data?.jwt ?? data?.access_token;
  if (!token) throw new ApiError(500, "Login succeeded but no token came back");
  return token;
}

export type User = Record<string, unknown>;

export const getMe = () => request<User>(ENDPOINTS.me);
