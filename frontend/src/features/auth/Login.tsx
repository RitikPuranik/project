
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button, ErrorNote, Field, Input } from "@/shared/components/ui";
import { useAuth } from "@/features/auth/auth";
import { errorMessage } from "@/shared/lib/format";

export default function Login() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[#0a7c72]" />
        Keep me signed in on this device
      </label>
      <Button type="submit" variant="primary" loading={busy} disabled={!email || !password}>
        Sign in
      </Button>
      <p className="text-center text-sm text-muted">
        New to Orbin?{" "}
        <Link to="/register" className="font-medium text-accent-strong underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </form>
  );
}
