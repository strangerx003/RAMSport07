/**
 * Password helpers for the server-side API.
 *
 * Parameters match the original ASP.NET Core backend: PBKDF2-HMAC-SHA-256,
 * 310,000 iterations and a 32-byte key. The built-in accounts therefore keep
 * the verifiers that were already issued.
 */

import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";

export const PBKDF2_ITERATIONS = 310_000;
export const PBKDF2_KEY_BYTES = 32;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_BYTES, "sha256", (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string, saltBase64: string): Promise<string> {
  return (await derive(password, Buffer.from(saltBase64, "base64"))).toString("base64");
}

export async function createPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16);
  return { salt: salt.toString("base64"), hash: (await derive(password, salt)).toString("base64") };
}

/** Compares two base64 digests without leaking the first differing byte. */
export async function verifyHash(
  password: string,
  saltBase64: string,
  expectedBase64: string,
): Promise<boolean> {
  try {
    const actual = Buffer.from(await hashPassword(password, saltBase64), "base64");
    const expected = Buffer.from(expectedBase64, "base64");
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** A random identifier that fits the API's `[A-Za-z0-9_-]{1,80}` rule. */
export function newAccountId(): string {
  return `user-${randomBytes(16).toString("hex")}`;
}
