"use client";
import { useState, type FormEvent } from "react";

type Step = { kind: "email" } | { kind: "code"; email: string };

async function post(path: string, body: unknown) {
  const res = await fetch("/api/v1/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Əməliyyat alınmadı. Bir az sonra yenidən cəhd edin.");
  return data;
}

export default function SignInForm({ returnTo }: { returnTo: string }) {
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function sendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") || "").trim();
    void run(async () => {
      await post("auth/code", { email });
      setNotice(`${email} ünvanına 6 rəqəmli kod göndərdik.`);
      setStep({ kind: "code", email });
    });
  }

  function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind !== "code") return;
    const code = String(new FormData(e.currentTarget).get("code") || "");
    void run(async () => {
      await post("auth/verify", { email: step.email, code });
      window.location.assign(returnTo);
    });
  }

  if (step.kind === "email")
    return (
      <form key="email" className="auth-form" onSubmit={sendCode}>
        <p>E-poçt ünvanınızı yazın, daxil olmaq üçün kod göndərək. Parol lazım deyil.</p>
        <label className="auth-field">
          <span>E-poçt</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="ad@nümunə.az"
            autoFocus
          />
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="dark-button" type="submit" disabled={busy}>
          {busy ? "Göndərilir…" : "Kod göndər"}
        </button>
      </form>
    );

  return (
    <form key="code" className="auth-form" onSubmit={verify}>
      <p role="status">{notice}</p>
      <label className="auth-field">
        <span>Kod</span>
        <input
          name="code"
          required
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          placeholder="123456"
          autoFocus
        />
      </label>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button className="dark-button" type="submit" disabled={busy}>
        {busy ? "Yoxlanılır…" : "Daxil ol"}
      </button>
      <button
        className="auth-link"
        type="button"
        disabled={busy}
        onClick={() => {
          setError("");
          setStep({ kind: "email" });
        }}
      >
        Başqa e-poçt yaz
      </button>
    </form>
  );
}
