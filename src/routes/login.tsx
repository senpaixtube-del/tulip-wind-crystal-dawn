import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { Logo } from "@/components/game/Logo";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (mode === "up") {
        const r = await authClient.signUp.email({
          email,
          password,
          name: username || email.split("@")[0] || "Hunter",
          callbackURL: "/",
        });
        if (r.error) throw new Error(r.error.message || "Sign up failed");
      } else {
        const r = await authClient.signIn.email({ email, password, callbackURL: "/" });
        if (r.error) throw new Error(r.error.message || "Sign in failed");
      }
      window.location.href = "/";
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="panel-strong w-full max-w-md rounded-xl p-6">
        <Logo compact />
        <h1 className="mt-4 font-display text-xl tracking-widest">COMMAND ACCESS</h1>
        <p className="mt-1 text-sm text-muted">Sign in to save rank, skins, and match history.</p>

        {authEnabled ? (
          <div className="mt-5 space-y-2">
            {GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                className="menu-btn"
              >
                Continue with {p.label}
              </button>
            ))}
            <div className="py-2 text-center text-xs tracking-widest text-muted">OR EMAIL</div>
            <form className="space-y-2" onSubmit={onEmail}>
              {mode === "up" && (
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  className="min-h-11 w-full rounded-md border border-border bg-surface px-3"
                />
              )}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="min-h-11 w-full rounded-md border border-border bg-surface px-3"
              />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="min-h-11 w-full rounded-md border border-border bg-surface px-3"
              />
              {err && <p className="text-sm text-danger">{err}</p>}
              <button type="submit" disabled={busy} className="menu-btn menu-btn-primary">
                {busy ? "..." : mode === "up" ? "Create account" : "Sign in"}
              </button>
            </form>
            <button
              type="button"
              className="w-full text-sm text-muted"
              onClick={() => setMode(mode === "up" ? "in" : "up")}
            >
              {mode === "up" ? "Have an account? Sign in" : "New hunter? Create account"}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Sign-in is disabled.</p>
        )}
        <Link to="/" className="mt-5 inline-block text-sm text-cyan">
          Back to arena
        </Link>
      </div>
    </main>
  );
}
