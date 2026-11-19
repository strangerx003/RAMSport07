/**
 * Server-side account directory.
 *
 * The user list is one document in the record store. Read-modify-write work is
 * serialised by `mutateRecord`, so two administrators creating accounts at the
 * same moment cannot lose one another's rows.
 */

import { mutateRecord, readRecord } from "./store";

export type StoredUser = {
  accountId: string;
  username: string;
  usernameKey: string;
  role: "admin" | "user";
  passwordSalt: string;
  passwordHash: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
};

const USERS_KEY = "users";
const SEED_DATE = "2026-01-01T00:00:00.000Z";

/**
 * The built-in accounts keep the verifiers issued by the original backend, so
 * `siva905` and `test` sign in exactly as before. `user` / `user` is the simple
 * standard account for shared workstations.
 */
const SEED_USERS: StoredUser[] = [
  {
    accountId: "admin-siva905",
    username: "siva905",
    usernameKey: "siva905",
    role: "admin",
    passwordSalt: "lzBP1OQ/LvtNK4defDCFcA==",
    passwordHash: "zMhwvm/1KyqVAactIseAQAfCQQTUxWwqnQlG9CIm9Bg=",
    active: true,
    createdAt: SEED_DATE,
    createdBy: "system",
  },
  {
    accountId: "test-user",
    username: "test",
    usernameKey: "test",
    role: "user",
    passwordSalt: "esMYJMh/zQkj2KHRZTWL1w==",
    passwordHash: "+d5I9PdZv6yM/9CAY/KuOTzwhdca0fg4LYjNI+FzAJw=",
    active: true,
    createdAt: SEED_DATE,
    createdBy: "system",
  },
  {
    accountId: "standard-user",
    username: "user",
    usernameKey: "user",
    role: "user",
    passwordSalt: "byyEtYAXGej1I0vEeKsEbA==",
    passwordHash: "HmtnVvMDMZFyTEVeXctOwA4v4Ot/y4/38rql0doYUrg=",
    active: true,
    createdAt: SEED_DATE,
    createdBy: "system",
  },
];

function isStoredUser(value: unknown): value is StoredUser {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredUser>;
  return typeof candidate.accountId === "string"
    && typeof candidate.username === "string"
    && typeof candidate.usernameKey === "string"
    && (candidate.role === "admin" || candidate.role === "user")
    && typeof candidate.passwordSalt === "string"
    && typeof candidate.passwordHash === "string";
}

function sanitiseUsers(value: unknown): StoredUser[] {
  return Array.isArray(value) ? value.filter(isStoredUser) : [];
}

function withBuiltIns(users: StoredUser[]) {
  const merged = [...users];
  for (const seedUser of SEED_USERS) {
    if (merged.some(user => user.usernameKey === seedUser.usernameKey)) continue;
    merged.push({ ...seedUser });
  }
  return merged;
}

let seeded = false;

/** Adds any missing built-in account exactly once per process. */
async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  await mutateRecord<StoredUser[]>(USERS_KEY, current => withBuiltIns(sanitiseUsers(current)));
  seeded = true;
}

export async function loadUsers(): Promise<StoredUser[]> {
  await ensureSeeded();
  return sanitiseUsers(await readRecord<unknown>(USERS_KEY));
}

/** Atomically reads, changes and writes the user directory. */
export async function updateUsers<T>(mutate: (users: StoredUser[]) => T | Promise<T>): Promise<T> {
  await ensureSeeded();
  let result!: T;
  await mutateRecord<StoredUser[]>(USERS_KEY, async current => {
    const users = sanitiseUsers(current);
    result = await mutate(users);
    // The record value is the directory itself. The mutator's return value is
    // only for the API caller and must never replace the persisted user array.
    return users;
  });
  return result;
}

export async function findUserByUsername(username: string): Promise<StoredUser | null> {
  const key = username.trim().toLocaleLowerCase();
  const users = await loadUsers();
  return users.find(user => user.usernameKey === key && user.active) ?? null;
}

export async function findUserByAccountId(accountId: string): Promise<StoredUser | null> {
  const users = await loadUsers();
  return users.find(user => user.accountId === accountId && user.active) ?? null;
}
