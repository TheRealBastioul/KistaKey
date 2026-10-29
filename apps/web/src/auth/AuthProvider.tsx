// Who's signed in and whether the vault is unlocked. The session lives in an
// httpOnly cookie (the API is the source of truth); the user key lives in
// keyStore, in memory only. A reload therefore lands on the lock screen.
//
// Login stretches the password once: the encKey from that derivation is kept
// here (memory, main thread) until the session reaches `ready` (after MFA /
// legal / MFA setup), then unwraps the user key without asking again.
import type { SessionResponse } from "@repo/types";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { authApi } from "../api/auth";
import { ApiError, onUnauthorized } from "../api/client";
import { cryptoClient } from "../crypto/client";
import { keyStore } from "./keyStore";

export type AuthState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "session"; session: SessionResponse; unlocked: boolean };

interface AuthContextValue {
  state: AuthState;
  /** prelogin → derive keys in the worker → login. Throws ApiError (e.g. EMAIL_NOT_VERIFIED). */
  login(email: string, password: string): Promise<void>;
  /** Takes a SessionResponse from login / MFA / legal accept; unlocks if a login encKey is pending. */
  applySession(session: SessionResponse): Promise<void>;
  /** Re-reads GET /auth/session. */
  refresh(): Promise<void>;
  /** Local unlock with the master password. Wrong password → isDecryptionFailure(err). */
  unlock(password: string): Promise<void>;
  /**
   * Re-prompt before a sensitive action: checks the master password locally
   * (same unlock in the worker, no server call) without changing any state.
   * Wrong password → isDecryptionFailure(err).
   */
  verifyPassword(password: string): Promise<void>;
  lock(): void;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Activity that counts against auto-lock. */
const ACTIVITY_EVENTS = ["pointerdown", "keydown"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionResponse | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState(keyStore.isUnlocked);
  const pendingEncKey = useRef<Uint8Array | null>(null);

  const dropPendingKey = useCallback(() => {
    pendingEncKey.current?.fill(0);
    pendingEncKey.current = null;
  }, []);

  const signOutLocally = useCallback(() => {
    dropPendingKey();
    keyStore.lock();
    setSession(null);
  }, [dropPendingKey]);

  const applySession = useCallback(async (next: SessionResponse) => {
    const encKey = pendingEncKey.current;
    if (next.step === "ready" && next.keys && encKey) {
      pendingEncKey.current = null;
      try {
        keyStore.set(
          await cryptoClient.call("unlockWithEncKey", encKey, next.keys.encryptedUserKey),
        );
      } finally {
        encKey.fill(0);
      }
    }
    setSession(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      await applySession(await authApi.session());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) signOutLocally();
      else throw err;
    }
  }, [applySession, signOutLocally]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { kdf, kdfSalt } = await authApi.prelogin(email);
      const { authKey, encKey } = await cryptoClient.call(
        "deriveLoginKeys",
        password,
        kdfSalt,
        kdf,
      );
      try {
        const next = await authApi.login(email, authKey);
        dropPendingKey();
        pendingEncKey.current = encKey;
        await applySession(next);
      } catch (err) {
        if (pendingEncKey.current !== encKey) encKey.fill(0);
        throw err;
      }
    },
    [applySession, dropPendingKey],
  );

  const unlock = useCallback(
    async (password: string) => {
      const keys = session?.keys;
      if (!keys) throw new Error("No key material in this session");
      keyStore.set(await cryptoClient.call("unlockWithPassword", password, keys));
    },
    [session],
  );

  const verifyPassword = useCallback(
    async (password: string) => {
      const keys = session?.keys;
      if (!keys) throw new Error("No key material in this session");
      (await cryptoClient.call("unlockWithPassword", password, keys)).fill(0);
    },
    [session],
  );

  const lock = useCallback(() => keyStore.lock(), []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Already signed out on the server (or offline): sign out locally anyway.
    }
    signOutLocally();
  }, [signOutLocally]);

  // First load: is there a session cookie?
  useEffect(() => {
    refresh().catch(() => signOutLocally());
  }, [refresh, signOutLocally]);

  useEffect(() => onUnauthorized(signOutLocally), [signOutLocally]);

  useEffect(() => keyStore.subscribe(() => setUnlocked(keyStore.isUnlocked())), []);

  // Auto-lock: user activity pushes the idle deadline back.
  useEffect(() => {
    if (!unlocked) return;
    const touch = () => keyStore.touch();
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, touch, { passive: true });
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, touch);
    };
  }, [unlocked]);

  const state = useMemo<AuthState>(() => {
    if (session === undefined) return { status: "loading" };
    if (session === null) return { status: "signed_out" };
    return { status: "session", session, unlocked };
  }, [session, unlocked]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, applySession, refresh, unlock, verifyPassword, lock, logout }),
    [state, login, applySession, refresh, unlock, verifyPassword, lock, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
