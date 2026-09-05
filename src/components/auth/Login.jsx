import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Waves } from "lucide-react";
import { useAuth } from "@/context/AuthContext.jsx";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 46 46" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M23 10.1c3.7 0 6.4 1.6 7.9 3l6-5.8C34.1 4.1 28.9 2 23 2 14.8 2 7.8 6.7 4 13.2l6.9 5.4C13.7 14.5 17.9 10.1 23 10.1z" />
      <path fill="#34A853" d="M9.5 23.4c0-1.2.2-2.3.7-3.4l-6.9-5.4C1.9 16.8 1 19.8 1 23.4c0 3.6.9 6.6 2.3 9.4l6.9-5.4c-.4-1-.7-2.1-.7-3.6z" />
      <path fill="#FBBC05" d="M23 36c-4.6 0-8.5-1.5-11.4-4.1l-6.9 5.4C7.8 40.8 14.6 45 23 45c6.9 0 12.7-2.4 17.1-6.4l-6.8-5.5C29.4 33.9 26.4 36 23 36z" />
      <path fill="#EA4335" d="M44.4 23.4c0-1.4-.1-2.4-.3-3.4H23v6.4h12.4c-.6 3.4-2.7 5.8-5.7 7.1l6.8 5.5c4-3.7 6.5-9.2 6.5-15.6z" />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loading, loginWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      navigate({ to: "/" });
    }
  }, [user, navigate]);

  const handleGoogleSignIn = async () => {
    setError("");
    setSigningIn(true);
    try {
      await loginWithGoogle();
      navigate({ to: "/" });
    } catch (err) {
      console.error(err);
      const message = err?.code === "auth/unauthorized-domain"
        ? "Google sign-in is blocked for this domain. Please authorize localhost in your Firebase Authentication settings and try again."
        : err?.code === "auth/operation-not-allowed"
          ? "Google sign-in is not enabled for this Firebase project. Enable it in Firebase Authentication and try again."
          : err?.code === "auth/popup-blocked"
            ? "The sign-in popup was blocked. Please allow pop-ups for this site and try again."
            : "Google sign-in failed. Please try again.";
      setError(message);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7fbfd] text-[#031222]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(0,128,215,0.05),transparent_35%),radial-gradient(circle_at_70%_20%,_rgba(77,185,150,0.03),transparent_30%),linear-gradient(180deg,_#f7fbfd_0%,_#e8f2f7_55%,_#daeefe_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle,_rgba(0,128,215,0.08),transparent_55%)] blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-[radial-gradient(circle,_rgba(218,238,254,0.1),transparent_55%)] blur-3xl" />

      <div className="relative mx-auto flex min-h-screen items-center justify-center px-6 py-12 sm:px-8">
        <div className="w-full max-w-sm rounded-2xl border border-[#e2e8f0] bg-white p-8 shadow-lg shadow-[rgba(0,128,215,0.08)]">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-[#0080d7]/10">
              <Waves className="h-8 w-8 text-[#0080d7]" />
            </div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#0080d7] font-semibold">FloodSight</p>
            <h1 className="mt-2 text-3xl font-bold text-[#0080d7]">Welcome to FloodSight</h1>
          </div>

          <p className="mb-8 text-center text-sm text-[#62748e]">
            Sign in to monitor flood conditions with live CCTV feeds and real-time routing guidance
          </p>

          {error ? (
            <div className="mb-6 rounded-xl border border-[#e7000b]/20 bg-[#e7000b]/10 px-4 py-3 text-sm text-[#e7000b]">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#4285F4] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#4285F4]/20 transition hover:bg-[#3367D6] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={handleGoogleSignIn}
            disabled={loading || signingIn}
          >
            <GoogleLogo />
            {loading || signingIn ? "Signing in…" : "Sign in with Google"}
          </button>

          <div className="mt-8 border-t border-[#e2e8f0] pt-6 text-center text-xs text-[#62748e]">
            © 2026 FloodSight. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}
