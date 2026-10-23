import { Link, Outlet } from "react-router-dom";
import { Logo } from "./ui";

export default function AuthLayout() {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <Logo size={30} />
          <span className="font-display text-2xl font-semibold tracking-tight">Orbin</span>
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-7 shadow-[0_1px_0_rgba(24,27,51,.04),0_12px_32px_-16px_rgba(24,27,51,.18)]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
