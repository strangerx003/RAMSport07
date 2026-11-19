/**
 * Provider identity, invitation, and encrypted delegated-token storage.
 * Engineering document bodies are deliberately never stored here.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mutateRecord, readRecord, writeRecord } from "./store";

export type CloudProvider = "google" | "microsoft";
export type CloudConnection = {
  provider: CloudProvider;
  email: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  rootId: string;
  connectedAt: string;
};
export type Invitation = { email: string; emailKey: string; tokenHash: string; expiresAt: string; acceptedAt?: string; revokedAt?: string; invitedBy: string; createdAt: string };

const INVITATIONS_KEY = "cloud-invitations";
const connectionKey = (accountId: string) => `cloud-connection:${accountId}`;
const encryptionKey = () => createHash("sha256").update(process.env.RAMSPORT_TOKEN_ENCRYPTION_KEY?.trim() || "ramsport-development-key-change-before-production").digest();

function seal(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}
function open(value: string) {
  const [ivText, tagText, bodyText] = value.split(".");
  if (!ivText || !tagText || !bodyText) throw new Error("Invalid encrypted cloud token.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(bodyText, "base64url")), decipher.final()]).toString("utf8");
}

export function oauthConfigured(provider: CloudProvider) {
  return provider === "google" ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) : Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}
export function providerLabel(provider: CloudProvider) { return provider === "google" ? "Google Drive" : "Microsoft OneDrive"; }
export function makeInvitationToken() { return randomBytes(32).toString("base64url"); }
export function hashInvitationToken(token: string) { return createHash("sha256").update(token).digest("base64url"); }

export async function createInvitation(email: string, invitedBy: string) {
  const normalized = email.trim().toLowerCase();
  const token = makeInvitationToken();
  const invitation: Invitation = { email, emailKey: normalized, tokenHash: hashInvitationToken(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), invitedBy, createdAt: new Date().toISOString() };
  await mutateRecord<Invitation[]>(INVITATIONS_KEY, current => {
    const records = Array.isArray(current) ? current as Invitation[] : [];
    return [...records.filter(item => item.emailKey !== normalized), invitation];
  });
  return { invitation, token };
}
export async function validateInvitation(token: string | null, email?: string) {
  if (!token) return null;
  const records = await readRecord<Invitation[]>(INVITATIONS_KEY) ?? [];
  const invitation = records.find(item => item.tokenHash === hashInvitationToken(token));
  if (!invitation || invitation.revokedAt || invitation.acceptedAt || new Date(invitation.expiresAt).getTime() < Date.now()) return null;
  if (email && invitation.emailKey !== email.trim().toLowerCase()) return null;
  return invitation;
}
export async function acceptInvitation(token: string) {
  await mutateRecord<Invitation[]>(INVITATIONS_KEY, current => (Array.isArray(current) ? current as Invitation[] : []).map(item => item.tokenHash === hashInvitationToken(token) ? { ...item, acceptedAt: new Date().toISOString() } : item));
}
export async function saveCloudConnection(accountId: string, connection: CloudConnection) {
  await writeRecord(connectionKey(accountId), { ...connection, accessToken: seal(connection.accessToken), refreshToken: seal(connection.refreshToken) });
}
export async function loadCloudConnection(accountId: string): Promise<CloudConnection | null> {
  const stored = await readRecord<Omit<CloudConnection, "accessToken" | "refreshToken"> & { accessToken: string; refreshToken: string }>(connectionKey(accountId));
  if (!stored) return null;
  try { return { ...stored, accessToken: open(stored.accessToken), refreshToken: open(stored.refreshToken) }; } catch { return null; }
}
export async function cloudStatus(accountId: string) {
  const connection = await loadCloudConnection(accountId);
  return connection ? { provider: connection.provider, label: providerLabel(connection.provider), email: connection.email, rootId: connection.rootId, connectedAt: connection.connectedAt } : null;
}
