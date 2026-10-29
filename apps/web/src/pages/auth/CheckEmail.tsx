import { useState } from "react";
import { Link, useLocation } from "react-router";
import { ResendVerification } from "../../components/ResendVerification";
import { Field } from "../../components/ui";

/** After signup (or an unverified login): "we sent you a link". */
export function CheckEmail() {
  const location = useLocation();
  const fromState = (location.state as { email?: string } | null)?.email ?? "";
  const [email, setEmail] = useState(fromState);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="mt-1 text-sm text-muted">
          {fromState ? (
            <>
              We sent a verification link to{" "}
              <span className="font-medium text-fg">{fromState}</span>.
            </>
          ) : (
            "We sent you a verification link."
          )}{" "}
          Open it to activate your account, then log in.
        </p>
      </div>

      {!fromState && (
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      )}

      <ResendVerification email={email.trim()} />

      <p className="text-sm text-muted">
        Verified already?{" "}
        <Link to="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
