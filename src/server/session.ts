/**
 * Signed, HttpOnly session cookies.
 *
 * The browser never sees an account id or password verifier. The cookie holds a
 * compact payload plus an HMAC-SHA-256 signature; the server re-checks the
 * signature and expiry on every request and then loads the account from the
 * user directory.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "./store";

export const SESSION_COOKIE = "ramsport_session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export type AccountSession = {
  accountId: string;
  username: string;
  role: "admin" | "user";
  signedInAt: string;
};

type TokenPayload = {
  /** account id */
  a: string;
  /** username */
  u: string;
  /** role */
  r: "admin" | "user";
  /** issued at (unix seconds) */
  iat: number;
  /** expires at (unix seconds) */
  exp: number;
};

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export async function createSessionToken(session: AccountSession): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    a: session.accountId,
    u: session.username,
    r: session.role,
    iat: issuedAt,
    exp: issuedAt + SESSION_MAX_AGE_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, await getSessionSecret())}`;
}

export async function verifySessionToken(token: string | null | undefined): Promise<AccountSession | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  try {
    const expected = sign(body, await getSessionSecret());
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (actualBytes.length !== expectedBytes.length) return null;
    if (!timingSafeEqual(actualBytes, expectedBytes)) return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<TokenPayload>;
    if (typeof payload.a !== "string" || typeof payload.u !== "string") return null;
    if (payload.r !== "admin" && payload.r !== "user") return null;
    if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return {
      accountId: payload.a,
      username: payload.u,
      role: payload.r,
      signedInAt: new Date((payload.iat ?? 0) * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    // A malformed percent escape in a cookie must read as "no cookie", not as
    // an unhandled exception that turns every request into a 500.
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export async function readSessionFromRequest(request: Request): Promise<AccountSession | null> {
  return verifySessionToken(readCookie(request, SESSION_COOKIE));
}

export function isSecureRequest(request: Request): boolean {
  const configured = process.env.RAMSPORT_COOKIE_SECURE?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  if (request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

function cookie(name: string, value: string, maxAge: number, secure: boolean) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function sessionCookie(token: string, request: Request): string {
  return cookie(SESSION_COOKIE, token, SESSION_MAX_AGE_SECONDS, isSecureRequest(request));
}

export function clearSessionCookie(request: Request): string {
  return cookie(SESSION_COOKIE, "", 0, isSecureRequest(request));
}

/**
 * Rejects cross-site state changes. The session cookie is SameSite=Lax already;
 * this is defence in depth for older browsers and misconfigured proxies.
 */
export function isSameOriginRequest(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  return true;
}
