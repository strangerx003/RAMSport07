"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { primeAccountSession } from "@/services/auth/session";

/** Built-in evaluation account. Hide the hint with NEXT_PUBLIC_SHOW_TEST_ACCESS=off. */
const SHOW_TEST_ACCESS = process.env.NEXT_PUBLIC_SHOW_TEST_ACCESS !== "off";
const TEST_USERNAME = "test";
const TEST_PASSWORD = "test";

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState("");
  const signInRef = useRef<HTMLButtonElement | null>(null);

  function useTestCredentials() {
    setUsername(TEST_USERNAME);
    setPassword(TEST_PASSWORD);
    setError("");
    setShowPassword(false);
    signInRef.current?.focus();
  }

  useEffect(() => { setInvite(new URLSearchParams(window.location.search).get("invite") ?? ""); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) { setError("Enter a username and password to continue."); return; }
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
      const result = await response.json() as { user?: { username:string; accountId:string; role?:"admin"|"user" }; error?:string };
      if (!response.ok || !result.user) { setError(result.error || "Incorrect username or password."); return; }
      const user=result.user;
      // The cookie is set, but this tab may still hold the signed-out session
      // memo from before sign-in. Prime it, or the shell bounces back to /login.
      primeAccountSession({
        username: user.username,
        accountId: user.accountId,
        role: user.role === "admin" ? "admin" : "user",
        signedInAt: new Date().toISOString(),
      });
      router.replace(user.role === "admin" ? "/admin" : "/dashboard");
      router.refresh();
    } catch {
      setError("Sign-in could not be completed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return <main className="login-page">
    <section className="login-visual">
      <Link className="login-brand" href="/" aria-label="RAMSport home"><div className="brand-mark">R</div><div><strong>RAMSport</strong><span>Engineering Suite</span></div></Link>
      <div className="visual-copy">
        <span className="secure-pill"><Icons.shield/> Engineering confidence, built in</span>
        <h1>Reliability decisions.<br/><em>Clearly connected.</em></h1>
        <p>Integrated reliability, availability, maintainability and safety engineering.</p>
        <div className="standard-row"><span>EN 50126</span><span>IEC 61078</span><span>IEC 61025</span><span>MIL-STD-882E</span></div>
      </div>
      <div className="network-art" aria-hidden="true"><svg viewBox="0 0 800 430"><path d="M50 290H190V170H325V260H470V115H650V235H770"/><path d="M190 290v65h280v-95M325 170V90h145v25"/><circle cx="190" cy="170" r="12"/><circle cx="325" cy="260" r="12"/><circle cx="470" cy="115" r="12"/><circle cx="650" cy="235" r="12"/></svg></div>
      <small className="login-footer">© 2026 RAMSport · Engineering systems you can trust</small>
    </section>
    <section className="login-panel">
      <Card className="login-card"><form onSubmit={submit}>
        <Link className="login-back" href="/">← Back to overview</Link>
        <Link className="mobile-brand" href="/" aria-label="RAMSport home"><div className="brand-mark">R</div><strong>RAMSport</strong></Link>
        <p className="eyebrow">SECURE ACCESS</p><h2>Welcome back</h2><p className="muted">Sign in to continue to RAMSport.</p>
        <label>Username<input value={username} onChange={event => setUsername(event.target.value)} placeholder="Enter your username" autoComplete="username" autoFocus/></label>
        <label>Password<div className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password"/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary-button login-button" type="submit" disabled={pending} ref={signInRef}>{pending ? "Signing in…" : "Sign in"} <span>→</span></button>
        {invite && <div className="cloud-login" aria-label="Subscriber cloud sign-in"><p>Invited subscriber access</p><a className="secondary-button" href={`/api/auth/google?invite=${encodeURIComponent(invite)}`}>Continue with Google Drive</a><a className="secondary-button" href={`/api/auth/microsoft?invite=${encodeURIComponent(invite)}`}>Continue with Microsoft 365</a><small>Your RAMSport files will be created in your connected cloud storage.</small></div>}
      </form>
      {SHOW_TEST_ACCESS && <aside className="login-tester" aria-label="Test access">
        <div className="login-tester-head">
          <span className="login-tester-badge">Test access</span>
          <span className="login-tester-note">Evaluation account</span>
        </div>
        <p>Review every module with the shared test account. Please keep confidential project data out of the test workspace.</p>
        <div className="login-tester-row">
          <span><b>Username</b><code>{TEST_USERNAME}</code></span>
          <span><b>Password</b><code>{TEST_PASSWORD}</code></span>
        </div>
        <button type="button" className="login-tester-fill" onClick={useTestCredentials}><Icons.users/> Use test credentials</button>
      </aside>}
    </Card>
    </section>
  </main>;
}
