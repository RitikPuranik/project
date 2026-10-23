import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/auth";
import { PageLoader } from "@/shared/components/ui";

// Landing page after Google sign-in: the backend puts the tokens in the URL fragment.
export default function GoogleCallback() {
  const { completeOAuth } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    window.history.replaceState(null, "", window.location.pathname); // keep tokens out of history
    if (!accessToken || !refreshToken) {
      navigate("/login?error=" + encodeURIComponent("Google sign-in failed"), { replace: true });
      return;
    }
    completeOAuth(accessToken, refreshToken)
      .then(() => navigate("/dashboard", { replace: true }))
      .catch(() => navigate("/login?error=" + encodeURIComponent("Google sign-in failed"), { replace: true }));
  }, [completeOAuth, navigate]);

  return <PageLoader label="Signing you in with Google" />;
}
