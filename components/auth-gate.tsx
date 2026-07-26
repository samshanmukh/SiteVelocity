"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

export function AuthGate({ status }: { status: number }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"refreshing" | "idle" | "submitting" | "error">(status === 401 ? "refreshing" : "idle");

  useEffect(() => {
    if (status !== 401) return;
    let active = true;
    fetch("/api/auth/session", { method: "PATCH" }).then((response) => {
      if (!active) return;
      if (response.ok) router.refresh();
      else setState("idle");
    }).catch(() => active && setState("idle"));
    return () => { active = false; };
  }, [router, status]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setState("submitting");
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (response.ok) router.refresh();
    else setState("error");
  };

  return (
    <main className="auth-gate" data-status={status}>
      <section>
        <p className="eyebrow">SiteVelocity</p>
        <h1>{status === 401 ? "Sign in to your workspace" : status === 403 ? "Organization access required" : "Workspace unavailable"}</h1>
        <p>Your property intelligence workspace is private and tenant-isolated.</p>
        {status === 401 ? (
          state === "refreshing" ? <p>Renewing your secure session…</p> : (
            <form onSubmit={(event) => void signIn(event)} style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <label>Email<input className="sv-search" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>Password<input className="sv-search" type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              <button className="sv-btn" disabled={state === "submitting"}>{state === "submitting" ? "SIGNING IN…" : "SIGN IN"}</button>
              {state === "error" ? <p style={{ color: "var(--red)" }}>The credentials were not accepted, or this account has no workspace membership.</p> : null}
            </form>
          )
        ) : null}
        <a href="/" style={{ display: "inline-block", marginTop: 16 }}>Return to the landing page</a>
      </section>
    </main>
  );
}
