"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { FileText, Loader2, Lock } from "lucide-react";

import {
  getAuthStatus,
  signIn,
  signOut,
  UNAUTHORIZED_EVENT,
} from "@/lib/api";

import { ErrorBanner, inputClass } from "@/components/workflows/shared/ui";

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
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] text-gray-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (state === "signed-out") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fafafa] px-5">
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-7 shadow-sm"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white">
              <FileText size={21} />
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">
              pdf<span className="text-violet-600">craft</span>
            </span>
          </div>

          <h1 className="text-lg font-semibold text-gray-900">Sign in</h1>
          <p className="mt-1 text-sm text-gray-500">
            Enter the password for this server.
          </p>

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
            className={`${inputClass} mt-5`}
          />

          <ErrorBanner message={error} />

          <button
            type="submit"
            disabled={busy || password === ""}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Lock size={17} />
            )}
            Sign in
          </button>
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
