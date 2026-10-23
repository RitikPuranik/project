
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button, ErrorNote, Field, Input, Select } from "@/shared/components/ui";
import { useAuth } from "@/features/auth/auth";
import { errorMessage } from "@/shared/lib/format";

export default function Register() {
  const { register, status } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "authed") navigate("/dashboard", { replace: true });
  }, [status, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("Use at least 6 characters for your password.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password, role);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Couldn't create your account."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-muted">New accounts start as Viewers. Project Managers and Admins can assign project roles.</p>
      </div>
      {error && <ErrorNote message={error} />}
      <Field label="Full name">
        {(id) => <Input id={id} autoComplete="name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Email">
        {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Field label="Password" hint="At least 6 characters.">
        {(id) => <Input id={id} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Button type="submit" variant="primary" loading={busy} disabled={!name || !email || !password}>
        Create account
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-accent-strong underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}
