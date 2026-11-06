"use client";
// "Məhsul haqqında suallar": published questions with their answers, and a form that sends a new
// question to moderation (it appears only after the owner approves it).
import { useEffect, useState } from "react";
import { MessageCircleQuestion, Send } from "lucide-react";
import { api, errorMessage } from "../app/ui";
import { azDate } from "./format";
import type { PublicQuestion } from "../lib/engagement-types";

export function ProductQuestions({
  productId,
  productName,
  initial,
  needUser,
  setToast,
}: {
  productId: string;
  productName: string;
  initial?: PublicQuestion[];
  needUser: () => boolean;
  setToast: (message: string) => void;
}) {
  const [questions, setQuestions] = useState<PublicQuestion[]>(initial || []);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    // The server renders the published questions; fetch only when it could not.
    if (initial) return;
    let cancelled = false;
    api<{ questions: PublicQuestion[] }>("questions?productId=" + encodeURIComponent(productId))
      .then((r) => !cancelled && setQuestions(r.questions))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial, productId]);
  return (
    <section className="pd-section qa-section" id="suallar" aria-labelledby="qa-title">
      <div className="section-heading">
        <div>
          <h2 id="qa-title">Məhsul haqqında suallar</h2>
          <p className="muted">
            Suallar yoxlanıldıqdan sonra cavabı ilə birlikdə yayımlanır. Cavabı Qəpik komandası və
            ya mağaza verir.
          </p>
        </div>
      </div>
      {questions.length ? (
        <ul className="qa-list">
          {questions.map((q) => (
            <li key={q.id} className="qa-item">
              <div className="qa-question">
                <span className="qa-mark" aria-hidden="true">
                  S
                </span>
                <div>
                  <p>{q.text}</p>
                  <small>
                    {q.name} · <time dateTime={q.date}>{azDate(q.date)}</time>
                  </small>
                </div>
              </div>
              {q.answer ? (
                <div className="qa-answer">
                  <span className="qa-mark qa-mark-answer" aria-hidden="true">
                    C
                  </span>
                  <div>
                    <p>{q.answer}</p>
                    <small>
                      {q.answeredBy || "Qəpik"}
                      {q.answeredAt && (
                        <>
                          {" · "}
                          <time dateTime={q.answeredAt}>{azDate(q.answeredAt)}</time>
                        </>
                      )}
                    </small>
                  </div>
                </div>
              ) : (
                <p className="qa-waiting muted">Cavab gözlənilir.</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="qa-empty">
          <MessageCircleQuestion size={28} strokeWidth={1.5} aria-hidden="true" />
          <p>Hələ sual yoxdur. {productName} haqqında ilk sualı sən ver.</p>
        </div>
      )}
      <form
        className="form-stack qa-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!needUser()) return;
          const form = e.currentTarget;
          const text = String(new FormData(form).get("question") || "").trim();
          setSending(true);
          try {
            await api("questions", { productId, text });
            setToast("Sualın yoxlanışa göndərildi. Təsdiqləndikdən sonra burada görünəcək.");
            form.reset();
          } catch (err) {
            setToast(errorMessage(err));
          }
          setSending(false);
        }}
      >
        <label>
          Sualın
          <textarea
            name="question"
            minLength={10}
            maxLength={500}
            required
            placeholder="Məsələn: Qutuda adapter varmı? Zəmanət rəsmidir?"
          />
        </label>
        <button className="dark-button" disabled={sending}>
          {sending ? "Göndərilir…" : "Sual ver"} <Send size={16} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
