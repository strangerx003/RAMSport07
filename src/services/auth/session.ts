/**
 * Client-side view of the server session.
 *
 * The session itself is an HttpOnly cookie owned by the server. This module
 * only asks `/api/auth/session` who is signed in; nothing is written to
 * localStorage or IndexedDB.
 *
 * The result is memoised for the life of the tab. Every workspace page mounts
 * the shell, and re-asking the server on each route change made navigation feel
 * slow: the shell showed its skeleton, waited for two round trips, then painted.
 * The cookie cannot change without a sign-in or sign-out, and both paths clear
 * this cache explicitly.
 */

export type AccountRole = "admin" | "user";

export type AccountSession = {
  username: string;
  accountId: string;
  role: AccountRole;
  signedInAt: string;
};

let cached: AccountSession | null | undefined;
let inflight: Promise<AccountSession | null> | null = null;

/** Synchronous snapshot for the first render, so a returning visit has no flash. */
export function getCachedAccountSession(): AccountSession | null {
  return cached ?? null;
}

export async function getAccountSession(): Promise<AccountSession | null> {
  if (cached !== undefined) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) {
        cached = null;
        return null;
      }
      const payload = await response.json() as { user?: { accountId?: string; username?: string; role?: string } };
      const user = payload.user;
      if (!user?.accountId || !user.username) {
        cached = null;
        return null;
      }
      cached = {
        username: user.username,
        accountId: user.accountId,
        role: user.role === "admin" ? "admin" : "user",
        signedInAt: new Date().toISOString(),
      };
      return cached;
    } catch {
      // A transient network error must not be cached as a signed-out state.
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function clearAccountSessionCache() {
  cached = undefined;
  inflight = null;
}

/**
 * Records the session returned by a successful sign-in.
 *
 * Signing in happens on `/login`, which mounts no shell, so the memo can still
 * hold the `null` read from an earlier signed-out page. Priming it here means
 * the first shell render after sign-in already knows who the user is instead of
 * bouncing straight back to `/login`.
 */
export function primeAccountSession(session: AccountSession) {
  cached = session;
  inflight = null;
}
