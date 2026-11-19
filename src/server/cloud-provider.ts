import { CloudProvider, type CloudConnection } from "./cloud-auth";

type TokenPayload = { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string };
const googleAuth = "https://accounts.google.com/o/oauth2/v2/auth";
const microsoftAuth = "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize";

export function callbackUrl(request: Request, provider: CloudProvider) { return new URL(`/api/auth/${provider}/callback`, request.url).toString(); }
export function authoriseUrl(request: Request, provider: CloudProvider, state: string, challenge: string) {
  const url = new URL(provider === "google" ? googleAuth : microsoftAuth);
  url.searchParams.set("client_id", provider === "google" ? process.env.GOOGLE_CLIENT_ID ?? "" : process.env.MICROSOFT_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", callbackUrl(request, provider));
  url.searchParams.set("response_type", "code"); url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge); url.searchParams.set("code_challenge_method", "S256");
  if (provider === "google") { url.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/drive.file"); url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent"); }
  else url.searchParams.set("scope", "openid profile email offline_access Files.ReadWrite");
  return url.toString();
}
async function token(url: string, body: Record<string, string>) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), cache: "no-store" });
  if (!response.ok) throw new Error("The cloud provider did not accept the authorization request.");
  return response.json() as Promise<TokenPayload>;
}
export async function exchangeCode(request: Request, provider: CloudProvider, code: string, verifier: string) {
  const body = { client_id: provider === "google" ? process.env.GOOGLE_CLIENT_ID ?? "" : process.env.MICROSOFT_CLIENT_ID ?? "", client_secret: provider === "google" ? process.env.GOOGLE_CLIENT_SECRET ?? "" : process.env.MICROSOFT_CLIENT_SECRET ?? "", code, redirect_uri: callbackUrl(request, provider), grant_type: "authorization_code", code_verifier: verifier };
  const payload = await token(provider === "google" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/organizations/oauth2/v2.0/token", body);
  if (!payload.access_token) throw new Error("The cloud provider did not return an access token.");
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token ?? "", expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 };
}
async function googleProfile(accessToken: string) {
  const profile = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { authorization: `Bearer ${accessToken}` } }).then(response => response.json() as Promise<{ email?: string; name?: string }>);
  if (!profile.email) throw new Error("Google did not provide an email address.");
  const query = encodeURIComponent("name='RAMSport' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const folders = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`, { headers: { authorization: `Bearer ${accessToken}` } }).then(response => response.json() as Promise<{ files?: { id: string }[] }>);
  let rootId = folders.files?.[0]?.id;
  if (!rootId) { const created = await fetch("https://www.googleapis.com/drive/v3/files", { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ name: "RAMSport", mimeType: "application/vnd.google-apps.folder" }) }).then(response => response.json() as Promise<{ id?: string }>); rootId = created.id; }
  if (!rootId) throw new Error("RAMSport could not create the Google Drive folder.");
  return { email: profile.email, displayName: profile.name || profile.email, rootId };
}
async function microsoftProfile(accessToken: string) {
  const profile = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName", { headers: { authorization: `Bearer ${accessToken}` } }).then(response => response.json() as Promise<{ mail?: string; userPrincipalName?: string; displayName?: string }>);
  const email = profile.mail || profile.userPrincipalName; if (!email) throw new Error("Microsoft did not provide an email address.");
  const root = await fetch("https://graph.microsoft.com/v1.0/me/drive/root:/RAMSport", { headers: { authorization: `Bearer ${accessToken}` } });
  let item = root.ok ? await root.json() as { id?: string } : null;
  if (!item?.id) { const created = await fetch("https://graph.microsoft.com/v1.0/me/drive/root/children", { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ name: "RAMSport", folder: {}, "@microsoft.graph.conflictBehavior": "fail" }) }); item = await created.json() as { id?: string }; }
  if (!item?.id) throw new Error("RAMSport could not create the OneDrive folder.");
  return { email, displayName: profile.displayName || email, rootId: item.id };
}
export async function cloudIdentity(provider: CloudProvider, tokens: { accessToken: string; refreshToken: string; expiresAt: number }): Promise<CloudConnection> {
  const identity = provider === "google" ? await googleProfile(tokens.accessToken) : await microsoftProfile(tokens.accessToken);
  return { provider, ...identity, ...tokens, connectedAt: new Date().toISOString() };
}
