// /verify-email#token=…  The token is in the fragment so it never reaches
// server logs or Referer headers. It's read once, then dropped from the URL.
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { authApi } from "../../api/auth";
import { errorMessage } from "../../api/client";
import { Alert } from "../../components/ui";

type Status = { kind: "verifying" } | { kind: "done" } | { kind: "failed"; message: string };

export function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const started = useRef(false);
  const [status, setStatus] = useState<Status>({ kind: "verifying" });

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice; the token is single-use.
    started.current = true;
    const token = new URLSearchParams(location.hash.slice(1)).get("token");
    navigate(location.pathname, { replace: true });
    if (!token) {
      setStatus({
        kind: "failed",
        message: "This link is incomplete. Open it again from the email.",
      });
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setStatus({ kind: "done" }))
      .catch((err: unknown) => setStatus({ kind: "failed", message: errorMessage(err) }));
  }, [location.hash, location.pathname, navigate]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Verify your email</h1>

      {status.kind === "verifying" && (
        <p className="text-sm text-muted" aria-busy="true">
          Verifying…
        </p>
      )}

      {status.kind === "done" && (
        <>
          <Alert tone="success">Your email is verified.</Alert>
          <Link
            to="/login"
            className="rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-accent-fg"
          >
            Log in
          </Link>
        </>
      )}

      {status.kind === "failed" && (
        <>
          <Alert tone="error">{status.message}</Alert>
          <p className="text-sm text-muted">
            Links expire and work once.{" "}
            <Link to="/check-email" className="text-accent hover:underline">
              Send a new link
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
