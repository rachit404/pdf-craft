"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Loader2, Lock } from "lucide-react";

import {
  getAuthStatus,
  signIn,
  signOut,
  UNAUTHORIZED_EVENT,
} from "@/lib/api";

import Button from "@/components/ui/Button";
import Logo from "@/components/ui/Logo";
import { ErrorBanner, inputClass } from "@/components/ui/blocks";

interface AuthContextValue {
  /** True when the server asks for a password (so a sign-out makes sense). */
  authRequired: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  authRequired: false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

type State = "checking" | "signed-out" | "ready";

/**
 * Shows the app, or a password page when the server has sign-in switched on.
 * If the server cannot be reached the app is shown, and its own errors explain.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const [authRequired, setAuthRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getAuthStatus()
      .then((status) => {
        if (cancelled) return;

        setAuthRequired(status.auth_required);
        setState(status.authenticated ? "ready" : "signed-out");
      })
      .catch(() => {
        if (!cancelled) setState("ready");
      });

    const expired = () => {
      setAuthRequired(true);
      setState("signed-out");
    };

    window.addEventListener(UNAUTHORIZED_EVENT, expired);

    return () => {
      cancelled = true;
      window.removeEventListener(UNAUTHORIZED_EVENT, expired);
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      await signIn(password);
      setPassword("");
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground text-fg-subtle">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (state === "signed-out") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ground px-5">
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="w-full max-w-sm rounded-box border border-line bg-surface p-6"
        >
          <div className="mb-5 flex items-center gap-2.5">
            <Logo className="size-8" />
            <span className="text-lg font-semibold tracking-tight">PDF Craft</span>
          </div>

          <h1 className="text-[0.95rem] font-semibold">Sign in</h1>
          <p className="mt-0.5 text-[0.85rem] text-fg-muted">Enter the password for this server.</p>

          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            disabled={busy}
            maxLength={256}
            placeholder="Password"
            onChange={(event) => setPassword(event.target.value)}
            className={`${inputClass} mt-4`}
          />

          <ErrorBanner message={error} />

          <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" disabled={busy || password === ""}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} strokeWidth={1.75} />}
            Sign in
          </Button>
        </form>
      </main>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        authRequired,
        signOut: async () => {
          await signOut();
          setState("signed-out");
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
