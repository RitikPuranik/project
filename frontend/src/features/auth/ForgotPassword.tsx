import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button, ErrorNote, Field, Input } from "@/shared/components/ui";
import api from "@/shared/lib/api";
import { errorMessage } from "@/shared/lib/format";

const RESEND_SECONDS = 60;

// Three separate steps: 1) enter email -> we email a 6-digit code, 2) verify the code, 3) set a new password.
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [resetToken, setResetToken] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.post<{ message: string }>("/auth/forgot-password", { email: email.trim() });
      setNotice(data.message);
      setStep("code");
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the code."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.post<{ resetToken: string }>("/auth/verify-reset-otp", { email: email.trim(), otp: otp.trim() });
      setResetToken(data.resetToken);
      setStep("password");
    } catch (err) {
      setError(errorMessage(err, "Couldn't verify the code."));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return setError("Use at least 6 characters for your password.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setError(null);
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { resetToken, newPassword: password });
      navigate("/login?notice=" + encodeURIComponent("Password updated. Sign in with your new password."), { replace: true });
    } catch (err) {
      const e2 = err as { response?: { data?: { code?: string } } };
      if (e2.response?.data?.code === "RESET_EXPIRED") {
        setStep("email");
        setOtp("");
        setPassword("");
        setConfirm("");
        setNotice(null);
      }
      setError(errorMessage(err, "Couldn't reset your password."));
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={requestCode} className="flex flex-col gap-5" noValidate>
        <div>
          <h1 className="text-2xl font-semibold">Forgot your password?</h1>
          <p className="mt-1 text-sm text-muted">Enter your email and we'll send you a 6-digit code.</p>
        </div>
        {error && <ErrorNote message={error} />}
        <Field label="Email">
          {(id) => (
            <Input id={id} type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!email}>
          Send code
        </Button>
        <p className="text-center text-sm text-muted">
          <Link to="/login" className="font-medium text-accent-strong underline underline-offset-2">
            Back to sign in
          </Link>
        </p>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={verifyCode} className="flex flex-col gap-5" noValidate>
        <div>
          <h1 className="text-2xl font-semibold">Enter your code</h1>
          <p className="mt-1 text-sm text-muted">{notice}</p>
        </div>
        {error && <ErrorNote message={error} />}
        <Field label="6-digit code">
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="tracking-[0.4em]"
            />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={busy} disabled={otp.length !== 6}>
          Verify code
        </Button>
        <div className="flex items-center justify-between text-sm text-muted">
          <button type="button" disabled={cooldown > 0 || busy} onClick={() => requestCode()} className="font-medium text-accent-strong underline underline-offset-2 disabled:cursor-not-allowed disabled:text-faint disabled:no-underline">
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
          <button type="button" onClick={() => { setStep("email"); setError(null); setOtp(""); }} className="underline underline-offset-2">
            Use a different email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={resetPassword} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold">Set a new password</h1>
        <p className="mt-1 text-sm text-muted">Code verified. Choose a new password for {email.trim()}.</p>
      </div>
      {error && <ErrorNote message={error} />}
      <Field label="New password" hint="At least 6 characters.">
        {(id) => <Input id={id} type="password" autoComplete="new-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Field label="Confirm new password">
        {(id) => <Input id={id} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
      <Button type="submit" variant="primary" loading={busy} disabled={!password || !confirm}>
        Reset password
      </Button>
    </form>
  );
}
