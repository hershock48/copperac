"use client";

import { useState } from "react";

/**
 * The passcode gate. Children only render once authed, so their fetches
 * never run for someone who has not opened the door. The server page passes
 * `initialAuthed` so a signed-in planner does not get a flash of the form on
 * every navigation. The 503 case is its own message: "not set up on this
 * deployment" is the operator's problem, and calling it a wrong passcode
 * would send her hunting for one that does not exist.
 */
export default function Gate({ initialAuthed, children }: { initialAuthed: boolean; children: React.ReactNode }) {
  const [authed, setAuthed] = useState(initialAuthed);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (authed) return <>{children}</>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/workroom/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setAuthed(true);
        return;
      }
      setError(data.error || "That did not work.");
    } catch {
      setError("Could not reach the site. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="wr-gate">
      <h1>Workroom</h1>
      <p className="wr-muted">Events and the menu on copperac.com. Locked to the club.</p>
      <form onSubmit={submit}>
        <label htmlFor="wr-pass">Passcode</label>
        <input
          id="wr-pass"
          type="password"
          value={passcode}
          autoComplete="current-password"
          onChange={(e) => setPasscode(e.target.value)}
          required
        />
        <button className="wr-btn" type="submit" disabled={busy}>
          {busy ? "Opening…" : "Open the workroom"}
        </button>
      </form>
      {error && (
        <p className="wr-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
