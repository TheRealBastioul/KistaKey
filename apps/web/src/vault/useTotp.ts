// The current TOTP code of an item plus seconds left, ticking every second.
// The code itself comes from the crypto worker, once per period.
import type { TotpConfig } from "@repo/types";
import { useEffect, useState } from "react";
import { cryptoClient } from "../crypto/client";

export interface TotpState {
  /** null until the first code arrives, or if the secret is invalid. */
  code: string | null;
  remaining: number;
  period: number;
  failed: boolean;
}

export function useTotp(config: TotpConfig | undefined): TotpState | null {
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<{ step: number; code: string | null } | null>(null);

  useEffect(() => {
    if (!config) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [config]);

  const secret = config?.secret;
  const algorithm = config?.algorithm;
  const digits = config?.digits;
  const period = config?.period ?? 30;
  const step = Math.floor(now / 1000 / period);

  useEffect(() => {
    if (!secret || !algorithm || !digits) return;
    let cancelled = false;
    cryptoClient.call("totpCode", { secret, algorithm, digits, period }, step * period * 1000).then(
      (code) => !cancelled && setResult({ step, code }),
      () => !cancelled && setResult({ step, code: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [secret, algorithm, digits, period, step]);

  if (!config) return null;
  const current = result?.step === step ? result : null;
  return {
    code: current?.code ?? null,
    remaining: period - (Math.floor(now / 1000) % period),
    period,
    failed: current !== null && current.code === null,
  };
}
