
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button, ErrorNote, Field, Input } from "@/shared/components/ui";
import { GoogleButton } from "@/features/auth/GoogleButton";
import { useAuth } from "@/features/auth/auth";
import { errorMessage } from "@/shared/lib/format";

// One-click sign-in for the accounts created by `npm run seed`. Shown only in `npm run dev`;
// production builds never include it (import.meta.env.DEV is false there).
const DEMO_PASSWORD = "Password@123";
const DEMO_ACCOUNTS = [
  ["Admin", "admin@orbin.test"],
  ["Project manager", "pm@orbin.test"],
  ["Member", "member@orbin.test"],
  ["Viewer", "viewer@orbin.test"],
] as const;

export default function Login() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(() => new URLSearchParams(window.location.search).get("error"));
  const [busy, setBusy] = useState(false);
  const notice = new URLSearchParams(window.location.search).get("notice");

  useEffect(() => {
    if (status === "authed") navigate("/dashboard", { replace: true });
  }, [status, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password, remember);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Couldn't sign you in."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Pick up where your team left off.</p>
      </div>
      {notice && !error && (
        <div role="status" className="rounded-xl border border-accent/25 bg-wash px-4 py-3 text-sm text-accent-strong">
          {notice}
        </div>
      )}
      {error && <ErrorNote message={error} />}
      <Field label="Email">
        {(id) => (
          <Input id={id} type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        )}
      </Field>
      <Field label="Password">
        {(id) => (
          <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </Field>
      <div className="-mt-3 text-right">
        <Link to="/forgot-password" className="text-[13px] font-medium text-accent-strong underline underline-offset-2">
          Forgot password?
        </Link>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[#3a7d4f]" />
        Keep me signed in on this device
      </label>
      <Button type="submit" variant="primary" loading={busy} disabled={!email || !password}>
        Sign in
      </Button>
      <GoogleButton />
      {import.meta.env.DEV && (
        <div className="rounded-xl border border-dashed border-line bg-paper px-4 py-3">
          <p className="text-xs font-medium text-muted">Demo accounts (after <code>npm run seed</code>)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map(([label, mail]) => (
              <button
                key={mail}
                type="button"
                onClick={() => {
                  setEmail(mail);
                  setPassword(DEMO_PASSWORD);
                }}
                className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink ring-1 ring-line hover:bg-wash"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-center text-sm text-muted">
        New to Orbin?{" "}
        <Link to="/register" className="font-medium text-accent-strong underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </form>
  );
}
