
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth";
import { ROLE_LABEL } from "@/shared/lib/format";
import { Avatar, Logo, PageLoader, cx } from "@/shared/components/ui";

const icon = (d: string) => (
  <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: icon("M3 10.5 10 4l7 6.5M5 9v7h10V9") },
  { href: "/projects", label: "Projects", icon: icon("M3 6a1 1 0 0 1 1-1h4l1.5 2H16a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z") },
  { href: "/users", label: "Users", icon: icon("M7.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 16c0-2.5 2.2-4 5-4s5 1.5 5 4M14 9.2a2.2 2.2 0 1 0 0-4.4M15 12.2c1.5.4 2.5 1.6 2.5 3.8"), admin: true },
  { href: "/profile", label: "Profile", icon: icon("M10 10a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 10 10ZM3.8 16.5c.6-2.6 3-4 6.2-4s5.6 1.4 6.2 4") },
];

export function AppShell() {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status === "anon") navigate("/login", { replace: true });
  }, [status, navigate]);

  useEffect(() => {
    queueMicrotask(() => setOpen(false));
  }, [pathname]);

  if (status !== "authed" || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <PageLoader label="Loading your workspace" />
      </div>
    );
  }

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.filter((n) => !n.admin || user.role === "admin").map((n) => {
        const active = pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            to={n.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex h-10 items-center gap-3 rounded-[9px] px-3 text-sm font-medium transition-colors",
              active ? "bg-accent-wash text-accent-strong" : "text-muted hover:bg-wash hover:text-ink"
            )}
          >
            {n.icon}
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="flex items-center gap-3 border-t border-line pt-4">
      <Avatar person={user} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.role ? ROLE_LABEL[user.role] : ""}</p>
      </div>
      <button
        type="button"
        onClick={logout}
        className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-wash hover:text-ink"
      >
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-screen flex-col justify-between border-r border-line bg-surface p-4 lg:flex">
        <div className="flex flex-col gap-8">
          <Link to="/dashboard" className="flex items-center gap-2.5 px-2 pt-1">
            <Logo />
            <span className="font-display text-xl font-semibold tracking-tight">Orbin</span>
          </Link>
          {nav}
        </div>
        {account}
      </aside>

      {/* mobile bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <Logo size={24} />
          <span className="font-display text-lg font-semibold">Orbin</span>
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="grid size-9 place-items-center rounded-lg hover:bg-wash"
        >
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3 6h14M3 10h14M3 14h14" />
          </svg>
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-hidden />
          <aside className="pop-in absolute inset-y-0 left-0 flex w-72 flex-col justify-between bg-surface p-4">
            <div className="flex flex-col gap-8">
              <div className="flex items-center gap-2.5 px-2 pt-1">
                <Logo />
                <span className="font-display text-xl font-semibold">Orbin</span>
              </div>
              {nav}
            </div>
            {account}
          </aside>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-[1280px]"><Outlet />
        </div>
      </main>
    </div>
  );
}
