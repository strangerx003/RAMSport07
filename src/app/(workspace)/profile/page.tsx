"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Avatar from "@/components/profile/Avatar";
import { Icons } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { STOCK_AVATARS, stockAvatarPath } from "@/lib/avatar-art";
import { AccountSession, getAccountSession } from "@/services/auth/session";

type Profile = {
  accountId: string;
  username: string;
  displayName: string;
  /** Present only for administrators ? access levels are not shown to anyone else. */
  role?: "admin" | "user";
  avatarUrl: string | null;
  avatarPreset?: string | null;
  hasPhoto: boolean;
  updatedAt: string | null;
};

const MAX_PHOTO_BYTES = 5_000_000;
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export default function ProfilePage() {
  const router = useRouter();
  const [session, setSession] = useState<AccountSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [preset, setPreset] = useState("");
  const [removePhoto, setRemovePhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const stored = await getAccountSession();
      if (!stored) { router.replace("/login"); return; }
      setSession(stored);
      try {
        const response = await fetch("/api/profile", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as Profile & { error?: string };
        if (!response.ok) throw new Error(data.error || "Profile could not be loaded.");
        setProfile(data);
        setDisplayName(data.displayName);
        setPreset(data.avatarPreset ?? "");
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Profile could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [router]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) { setError("Choose a PNG, JPEG or WebP image."); return; }
    if (file.size > MAX_PHOTO_BYTES) { setError("Choose an image smaller than 5 MB."); return; }
    setError("");
    setNotice("");
    setPhoto(file);
    setPreset("");
    setRemovePhoto(false);
    setPreview(URL.createObjectURL(file));
  }

  function chooseStock(id: string) {
    setPreset(id);
    setPhoto(null);
    setRemovePhoto(false);
    setPreview("");
    setError("");
    setNotice("");
  }

  function clearPhoto() {
    setPhoto(null);
    setPreset("");
    setRemovePhoto(true);
    setPreview("");
    setError("");
    setNotice("");
  }

  function cancelPhoto() {
    setPhoto(null);
    setRemovePhoto(false);
    setPreview("");
    setPreset(profile?.avatarPreset ?? "");
    setError("");
    setNotice("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const nextName = displayName.trim();
    if (!nextName) { setError("Enter a display name."); return; }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.set("displayName", nextName);
      if (photo) body.set("image", photo);
      if (preset) body.set("avatarPreset", preset);
      if (removePhoto) body.set("removePhoto", "true");
      const response = await fetch("/api/profile", { method: "POST", body });
      const data = await response.json() as { profile?: Profile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "Profile could not be saved.");
      setProfile(data.profile);
      setDisplayName(data.profile.displayName);
      setPhoto(null);
      setRemovePhoto(false);
      setPreview("");
      setPreset(data.profile.avatarPreset ?? "");
      setNotice("Profile saved.");
      window.dispatchEvent(new Event("ramsport-profile-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return <div className="boot-screen"><div className="brand-mark small">R</div><span>Checking access?</span></div>;

  const name = displayName || profile?.displayName || session.username;
  const role = profile?.role ?? session.role;
  const presetSrc = preset ? stockAvatarPath(preset) ?? "" : "";
  const avatar = removePhoto ? "" : preview || presetSrc || profile?.avatarUrl || "";

  return <AppShell title="Profile" eyebrow="ACCOUNT SETTINGS">
    <main className="profile-page" aria-label="Account profile">
      <section className="profile-card profile-identity">
        <div className="profile-avatar-wrap">
          <div className="profile-avatar">
            <Avatar name={name} src={avatar} alt={`${name} profile photo`}/>
          </div>
          <button type="button" className="avatar-edit" onClick={() => fileInput.current?.click()} disabled={loading || saving} aria-label={avatar ? "Change profile photo" : "Upload profile photo"} title={avatar ? "Change profile photo" : "Upload profile photo"}>
            <Icons.camera/>
          </button>
          {photo && <span className="avatar-pending">New photo ? save to apply</span>}
        </div>
        <h2>{name}</h2>
        <p>@{session.username}</p>
        {role === "admin" && <span className="profile-role admin">Administrator</span>}
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={choosePhoto}/>
        <div className="profile-photo-row">
          {photo
            ? <button type="button" className="profile-undo" onClick={cancelPhoto} disabled={saving}>Cancel new photo</button>
            : profile?.hasPhoto && <button type="button" className="profile-remove" onClick={clearPhoto} disabled={saving || removePhoto}><Icons.trash/> {removePhoto ? "Photo removed on save" : "Remove picture"}</button>}
        </div>
        <fieldset className="avatar-stock">
          <legend>Or pick an illustration</legend>
          <div className="avatar-stock-grid">
            {STOCK_AVATARS.map(option => <button key={option.id} type="button" className="avatar-stock-option" data-active={preset === option.id} aria-pressed={preset === option.id} onClick={() => chooseStock(option.id)} disabled={loading || saving} title={option.label}>
              <img src={option.src} alt=""/>
              {preset === option.id && <span className="avatar-stock-check" aria-hidden="true">?</span>}
              <span className="sr-only">{option.label}</span>
            </button>)}
          </div>
        </fieldset>
        <small>Click the edit icon on the photo to upload your own (PNG, JPEG or WebP, up to 5 MB), or pick one of the bundled illustrations. Changes apply when you save.</small>
      </section>

      <section className="profile-card">
        <h2>Account details</h2>
        <p className="profile-intro">Update how your name appears across the RAMSport workspace.</p>
        <form onSubmit={save} className="profile-form">
          <label>Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} autoComplete="name" placeholder="Your name" disabled={loading || saving}/></label>
          <label>Username<input value={session.username} readOnly aria-readonly="true"/></label>
          {role === "admin" && <label>Access level<input value="Administrator" readOnly aria-readonly="true"/></label>}
          <label>Account ID<input value={profile?.accountId ?? session.accountId} readOnly aria-readonly="true"/></label>
          <p className="profile-hint">Your username cannot be changed here. The photo and display name are stored on the server.</p>
          {error && <div className="profile-notice error" role="alert">{error}</div>}
          {notice && <div className="profile-notice success" role="status">{notice}</div>}
          <div className="profile-form-actions">
            <Button className="primary-button" type="submit" disabled={saving || loading}>{saving ? "Saving?" : "Save changes"} <Icons.save/></Button>
            <Button className="secondary-button" variant="outline" type="button" onClick={() => router.push("/dashboard")} disabled={saving}>Back to files</Button>
          </div>
        </form>
      </section>
    </main>
  </AppShell>;
}
