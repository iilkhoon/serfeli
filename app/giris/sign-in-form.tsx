"use client";
import { useState, type FormEvent } from "react";

type Mode = "login" | "register";

export default function SignInForm({ returnTo }: { returnTo: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") || "");
    if (mode === "register" && password !== String(form.get("password2") || "")) {
      setError("Parollar eyni deyil.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/" + mode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") || "").trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok)
        throw new Error(data.error || "Əməliyyat alınmadı. Bir az sonra yenidən cəhd edin.");
      window.location.assign(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const register = mode === "register";
  return (
    <form key={mode} className="auth-form" onSubmit={submit}>
      <p>
        {register
          ? "Seçilmişlərin və qiymət bildirişlərin hesabında saxlanılsın."
          : "E-poçt və parolunuzla daxil olun."}
      </p>
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
      <label className="auth-field">
        <span>Parol</span>
        <input
          name="password"
          type="password"
          required
          minLength={register ? 8 : undefined}
          maxLength={200}
          autoComplete={register ? "new-password" : "current-password"}
        />
      </label>
      {register && (
        <label className="auth-field">
          <span>Parolu təkrarla</span>
          <input
            name="password2"
            type="password"
            required
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
          />
        </label>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button className="dark-button" type="submit" disabled={busy}>
        {busy ? "Gözləyin…" : register ? "Hesab yarat" : "Daxil ol"}
      </button>
      <button
        className="auth-link"
        type="button"
        disabled={busy}
        onClick={() => {
          setError("");
          setMode(register ? "login" : "register");
        }}
      >
        {register ? "Hesabım var, daxil olum" : "Hesabın yoxdur? Qeydiyyatdan keç"}
      </button>
    </form>
  );
}
