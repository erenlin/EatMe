// Keeps the JWT in memory, mirrored to sessionStorage so a refresh doesn't log you out.
const KEY = "eatme_token";
let memoryToken: string | null = null;

export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = sessionStorage.getItem(KEY);
  } catch {
    // storage blocked; fall back to memory only
  }
  return memoryToken;
}

export function setToken(token: string): void {
  memoryToken = token;
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // storage blocked; fall back to memory only
  }
}

export function clearToken(): void {
  memoryToken = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // storage blocked
  }
}
