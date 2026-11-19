"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { stripBasePath } from "@/lib/base-path";
import { Icons } from "@/lib/icons";
import { folderHref, type DocumentContext } from "@/lib/document-context";
import { AccountSession, clearAccountSessionCache, getAccountSession, getCachedAccountSession } from "@/services/auth/session";
import { Skeleton } from "@/components/ui/skeleton";
import Avatar from "@/components/profile/Avatar";
import { AppDialogProvider } from "@/components/ui/app-dialog";
import { Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type NavigationItem = { href?: string; label: string; icon: typeof Icons.grid; planned?: boolean };

const nav: NavigationItem[] = [
  { href: "/dashboard", label: "Files", icon: Icons.grid },
  { href: "/data-register", label: "Data Register", icon: Icons.table },
  { href: "/rbd", label: "RBD", icon: Icons.rbd },
  { href: "/fta", label: "FTA", icon: Icons.fta },
  { href: "/weibull", label: "Weibull Analysis", icon: Icons.weibull },
  { href: "/mil-std-217f", label: "MIL-STD-217F", icon: Icons.chip },
  { href: "/fmeca", label: "FMECA", icon: Icons.matrix },
  { href: "/lcc-pm", label: "LCC-PM", icon: Icons.grid },
  { href: "/lcc-cm", label: "LCC-CM", icon: Icons.grid },
  { href: "/spare-parts", label: "Spare Parts Analysis", icon: Icons.grid },
  { label: "RCIL", icon: Icons.table, planned: true },
  { label: "SCIL", icon: Icons.table, planned: true },
  { label: "Variable Analysis", icon: Icons.grid, planned: true },
];
const adminNav: NavigationItem = { href: "/admin", label: "Admin", icon: Icons.users };

type UserProfile = { displayName: string; username: string; role: "admin" | "user"; avatarUrl: string | null; hasPhoto: boolean };

/**
 * The profile is shared by every page. Keeping the last response in module
 * scope means a route change reuses it instead of waiting on `/api/profile`
 * again; the focus and profile-updated listeners still refresh it.
 */
let cachedProfile: { value: UserProfile; at: number } | null = null;
const PROFILE_TTL_MS = 60_000;

type AppShellProps = {
  children: React.ReactNode;
  title: string;
  documentName?: string;
  document?: DocumentContext | null;
  eyebrow?: string;
  actions?: React.ReactNode;
  /** Hides the page title band when the page renders its own heading. */
  hideHeader?: boolean;
};

export default function AppShell({ children, title, documentName, document, eyebrow, actions, hideHeader }: AppShellProps) {
  const pathname = stripBasePath(usePathname());
  const router = useRouter();
  const [session, setSession] = useState<AccountSession | null>(() => getCachedAccountSession());
  const [profile, setProfile] = useState<UserProfile | null>(() => cachedProfile?.value ?? null);
  const [ready, setReady] = useState(() => Boolean(getCachedAccountSession()));
  const [navSearch, setNavSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    let active = true;
    void getAccountSession().then(stored => {
      if (!active) return;
      if (!stored) { router.replace("/login"); return; }
      setSession(stored);
      setReady(true);
    });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    const match = window.document.cookie.split("; ").find(part => part.startsWith("ramsport-theme="));
    const isDark = match?.slice("ramsport-theme=".length) === "dark";
    window.document.documentElement.dataset.theme = isDark ? "dark" : "light";
    setDarkMode(isDark);
  }, []);

  function toggleDarkMode(nextDark: boolean) {
    window.document.documentElement.dataset.theme = nextDark ? "dark" : "light";
    // A first-party preference cookie (not browser storage) lets the server
    // render the correct theme on the next request without a flash.
    window.document.cookie = `ramsport-theme=${nextDark ? "dark" : "light"}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setDarkMode(nextDark);
  }

  const loadProfile = useCallback(async (signal?: AbortSignal, force = false) => {
    if (!force && cachedProfile && Date.now() - cachedProfile.at < PROFILE_TTL_MS) {
      setProfile(cachedProfile.value);
      return;
    }
    try {
      const response = await fetch("/api/profile", { cache: "no-store", signal });
      if (!response.ok) return;
      const data = await response.json() as Partial<UserProfile>;
      if (!data.displayName) return;
      const next: UserProfile = {
        displayName: data.displayName,
        username: data.username || "",
        role: data.role === "admin" ? "admin" : "user",
        avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
        hasPhoto: Boolean(data.hasPhoto),
      };
      cachedProfile = { value: next, at: Date.now() };
      setProfile(next);
    } catch { /* menu falls back to the session username and initials */ }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    void loadProfile(controller.signal);
    const refresh = () => { void loadProfile(undefined, true); };
    window.addEventListener("ramsport-profile-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.removeEventListener("ramsport-profile-updated", refresh); window.removeEventListener("focus", refresh); };
  }, [ready, loadProfile]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(value => !value); }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (ready) void fetch("/api/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "module.open", resource: pathname }) }).catch(() => undefined);
  }, [pathname, ready]);

  const user = profile?.displayName || session?.username || "RAMS User";
  const isAdmin = session?.role === "admin";
  const navigation = useMemo(() => isAdmin ? [...nav, adminNav] : nav, [isAdmin]);
  const searchableItems = useMemo(() => navigation.filter((item): item is NavigationItem & { href: string } => Boolean(item.href) && !item.planned), [navigation]);
  const searchResults = useMemo(() => navSearch.trim() ? searchableItems.filter(item => item.label.toLowerCase().includes(navSearch.toLowerCase())).slice(0, 7) : [], [navSearch, searchableItems]);

  async function logout() {
    clearAccountSessionCache();
    cachedProfile = null;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  if (!ready || !session) return <div className="app-loading-shell" aria-label="Loading RAMSport"><aside><Skeleton/><Skeleton/><Skeleton/><Skeleton/></aside><main><Skeleton/><div><Skeleton/><Skeleton/><Skeleton/></div></main></div>;

  const documentFolderSegments = document ? document.folder.split("/").filter(Boolean) : [];
  const documentLabel = document?.name || documentName || `Untitled ${title}`;

  // Top path crumbs: Files ? project ? folders ? current document or module.
  type Crumb = { label: string; href?: string; title?: string };
  const crumbs: Crumb[] = [{ label: "Files", href: "/dashboard" }];
  if (document) {
    crumbs.push({ label: document.project, href: folderHref(document.project) });
    documentFolderSegments.forEach((segment, index) => {
      crumbs.push({ label: segment, href: folderHref([document.project, ...documentFolderSegments.slice(0, index + 1)].join("/")) });
    });
    crumbs.push({ label: document.name, title: document.path });
  } else if (!(title === "Files" && !documentName)) {
    crumbs.push({ label: title === "Reliability Block Diagram" ? "RBD" : title === "Fault Tree Analysis" ? "FTA" : title });
    if (documentName) crumbs.push({ label: documentName, title: documentLabel });
  }

  // Long paths collapse the middle segments into an overflow menu.
  const crumbNodes = crumbs.length > 5
    ? [{ kind: "item" as const, crumb: crumbs[0] }, { kind: "menu" as const, items: crumbs.slice(1, crumbs.length - 2) }, ...crumbs.slice(-2).map(crumb => ({ kind: "item" as const, crumb }))]
    : crumbs.map(crumb => ({ kind: "item" as const, crumb }));

  const pathCrumbs: React.ReactNode[] = [];
  crumbNodes.forEach((node, nodeIndex) => {
    if (nodeIndex > 0) pathCrumbs.push(<BreadcrumbSeparator key={`path-sep-${nodeIndex}`}/>);
    if (node.kind === "menu") {
      pathCrumbs.push(
        <BreadcrumbItem key="path-overflow">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Show ${node.items.length} earlier locations`}><BreadcrumbEllipsis/></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="account-menu breadcrumb-menu">
              {node.items.map(item => item.href
                ? <DropdownMenuItem key={item.label} asChild><Link href={item.href}>{item.label}</Link></DropdownMenuItem>
                : <DropdownMenuItem key={item.label}>{item.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </BreadcrumbItem>,
      );
      return;
    }
    const isLast = nodeIndex === crumbNodes.length - 1;
    pathCrumbs.push(
      <BreadcrumbItem key={`path-crumb-${nodeIndex}`}>
        {isLast
          ? <BreadcrumbPage title={node.crumb.title}>{node.crumb.label}</BreadcrumbPage>
          : node.crumb.href
            ? <BreadcrumbLink asChild><Link href={node.crumb.href} title={node.crumb.title}>{node.crumb.label}</Link></BreadcrumbLink>
            : <BreadcrumbLink asChild><span className="document-untitled">{node.crumb.label}</span></BreadcrumbLink>}
      </BreadcrumbItem>,
    );
  });

  return <AppDialogProvider><div className={`app-layout${hideHeader ? " no-page-header" : ""}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">R</div><div><strong>RAMSport</strong><span>Engineering Suite</span></div></div>
      <button className="sidebar-search command-search" onClick={() => setSearchOpen(value => !value)} aria-expanded={searchOpen}><Icons.search/><span>Search files and tools</span><kbd>Ctrl K</kbd></button>
      {searchOpen && <section className="sidebar-command-panel" aria-label="Search files and tools">
        <label><Icons.search/><input autoFocus value={navSearch} onChange={event => setNavSearch(event.target.value)} placeholder="Type to search?"/></label>
        {navSearch.trim()
          ? searchResults.map(item => { const ResultIcon = item.icon; return <Link href={item.href} key={item.label} onClick={() => { setSearchOpen(false); setNavSearch(""); }}><ResultIcon/><span>{item.label}</span></Link>; })
          : <p>Start typing to find a tool or file.</p>}
        {navSearch.trim() && searchResults.length === 0 && <p>No matching tools or files.</p>}
      </section>}
      <div className="workspace-label">TOOLS</div>
      <nav>{navigation.map(item => {
        const ItemIcon = item.icon;
        if (item.planned || !item.href) return <span key={item.label} className="nav-item planned" aria-disabled="true" title="Planned module"><ItemIcon/><span>{item.label}</span><b>Soon</b></span>;
        const active = pathname === item.href;
        return <Link key={item.label} href={item.href} className={`${active ? "nav-item active" : "nav-item"}`}><ItemIcon/><span>{item.label}</span>{active && <i/>}</Link>;
      })}</nav>
      <div className="sidebar-spacer"/>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <Breadcrumb className="document-path">
          <BreadcrumbList>{pathCrumbs}</BreadcrumbList>
        </Breadcrumb>
        <div className="topbar-account">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="account-trigger" aria-label="Open account menu"><Avatar name={user} src={profile?.avatarUrl}/></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="account-menu">
              <DropdownMenuGroup>
                <DropdownMenuLabel><strong>{user}</strong><small>@{session.username}{isAdmin ? " ? Administrator" : ""}</small></DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => router.push("/profile")}>Profile</DropdownMenuItem>
                {isAdmin && <DropdownMenuItem onSelect={() => router.push("/admin")}>User administration</DropdownMenuItem>}
              </DropdownMenuGroup>
              <DropdownMenuSeparator/>
              <div className="appearance-block">
                <span className="appearance-label">Appearance</span>
                <div className="appearance-switch" role="group" aria-label="Colour theme">
                  <button type="button" className="appearance-option" role="menuitemradio" aria-checked={!darkMode} aria-pressed={!darkMode} data-active={!darkMode} onClick={() => toggleDarkMode(false)} title="Use the light interface"><Icons.sun/><span>Light</span></button>
                  <button type="button" className="appearance-option" role="menuitemradio" aria-checked={darkMode} aria-pressed={darkMode} data-active={darkMode} onClick={() => toggleDarkMode(true)} title="Use the dark interface"><Icons.moon/><span>Dark</span></button>
                </div>
              </div>
              <DropdownMenuSeparator/>
              <DropdownMenuItem onSelect={logout}>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {!hideHeader && <section className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1></div>
        {/* Modules publish their headline figures into this slot, so the module
            panel below always opens with its toolbar as the first row. */}
        <div className="page-kpis" id="page-kpis"/>
        {actions && <div className="page-actions">{actions}</div>}
      </section>}
      <div className="page-content">{children}</div>
    </main>
  </div></AppDialogProvider>;
}
