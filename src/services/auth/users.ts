import type { AccountRole } from "./session";

export const USERS_UPDATED_EVENT = "ramsport-users-updated";

export type StoredUser = {
  id: string;
  username: string;
  usernameKey: string;
  role: AccountRole;
  createdAt: string;
  createdBy: string;
};

export type NewUserInput = {
  username: string;
  password: string;
  role: AccountRole;
  /** Retained for call-site compatibility; the server records the signed-in administrator. */
  createdBy?: string;
};

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

async function readJson<T>(response: Response) {
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "The user directory could not be updated.");
  return payload;
}

function notifyUsersChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(USERS_UPDATED_EVENT));
}

/** Reads the account directory from the authenticated API. */
export async function listUsers(): Promise<StoredUser[]> {
  const response = await fetch("/api/admin/users", { cache: "no-store" });
  const payload = await readJson<{ users?: StoredUser[] }>(response);
  return Array.isArray(payload.users)
    ? payload.users.map(user => ({
        id: user.id,
        username: user.username,
        usernameKey: user.usernameKey || user.username.toLocaleLowerCase(),
        role: user.role === "admin" ? "admin" : "user",
        createdAt: user.createdAt,
        createdBy: user.createdBy || "system",
      }))
    : [];
}

export async function createUser({ username, password, role }: NewUserInput): Promise<StoredUser> {
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 32) throw new Error("Username must be between 3 and 32 characters.");
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) throw new Error("Username can use letters, numbers, dot, dash and underscore only.");
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password.length > MAX_PASSWORD_LENGTH) throw new Error(`Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`);
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Password must contain at least one uppercase letter, one lowercase letter, and one number.");
  }

  const response = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: trimmed, password, role }),
  });
  const payload = await readJson<{ user?: StoredUser }>(response);
  if (!payload.user) throw new Error("The user could not be created.");
  notifyUsersChanged();
  return payload.user;
}

export async function removeUser(id: string, actorId?: string): Promise<void> {
  void actorId;
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  await readJson<{ ok?: boolean }>(response);
  notifyUsersChanged();
}

const BUILT_IN_USERNAME_KEYS = new Set(["siva905", "test", "user"]);

/**
 * Built-in accounts are seeded on first run and cannot be removed, so an
 * administrator can never lock the workspace out of its own sign-in accounts.
 */
export function isBuiltInAccount(user: StoredUser) {
  return BUILT_IN_USERNAME_KEYS.has(user.usernameKey);
}
