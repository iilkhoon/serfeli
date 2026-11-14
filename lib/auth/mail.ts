// Sends sign-in codes through Resend (RESEND_API_KEY, MAIL_FROM; RESEND_API_URL only for tests). Without a key, development prints
// the code to the server log instead; production refuses, so a code is never silently lost.
export async function sendSignInCode(email: string, code: string, minutes: number) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production")
      throw new Error("RESEND_API_KEY təyin edilməyib: giriş kodu göndərilə bilmir.");
    console.log(`[giriş] ${email} üçün kod: ${code}`);
    return;
  }
  const subject = `Qəpik giriş kodu: ${code}`;
  const text = `Qəpik-ə daxil olmaq üçün kodunuz: ${code}\n\nKod ${minutes} dəqiqə etibarlıdır. Bu sorğunu siz göndərməmisinizsə, bu məktubu nəzərə almayın.`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#22111a"><p>Qəpik-ə daxil olmaq üçün kodunuz:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#d81b54">${code}</p><p>Kod ${minutes} dəqiqə etibarlıdır. Bu sorğunu siz göndərməmisinizsə, bu məktubu nəzərə almayın.</p></div>`;
  const api = process.env.RESEND_API_URL || "https://api.resend.com";
  const res = await fetch(api + "/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || "Qəpik <giris@qepik.az>",
      to: [email],
      subject,
      text,
      html,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    console.error("Resend xətası:", res.status, (await res.text()).slice(0, 300));
    throw new Error("Giriş kodu göndərilə bilmədi.");
  }
}
