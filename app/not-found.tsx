import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Səhifə tapılmadı | Qəpik",
  description: "Axtardığınız səhifə Qəpik-də mövcud deyil.",
  robots: { index: false, follow: true },
};
// Rendered outside the storefront shell: it brings its own logo, search and ways back.
export default function NotFound() {
  return (
    <main className="nf" id="main-content">
      <div className="nf-card">
        <a className="logo" href="/" aria-label="Qəpik ana səhifə">
          <img src="/favicon.svg" alt="" width={36} height={36} />
          qəpik<span className="logo-dot">.</span>
        </a>
        <span className="nf-code" aria-hidden="true">
          404
        </span>
        <h1>Səhifə tapılmadı</h1>
        <p>Bu məhsul və ya səhifə artıq kataloqda yoxdur. Axtarışla tap və ya kataloqa qayıt.</p>
        <form
          action="/axtaris"
          method="get"
          className="h-search"
          role="search"
          aria-label="Məhsul axtarışı"
        >
          <input
            name="q"
            required
            placeholder="Nə axtarırsan? Məsələn, iPhone 17"
            aria-label="Məhsul, model və ya brend axtar"
          />
          <button type="submit">Axtar</button>
        </form>
        <nav className="nf-links" aria-label="Əsas bölmələr">
          <a href="/">Ana səhifə</a>
          <a href="/kataloq">Kataloq</a>
          <a href="/endirimler">Qiyməti düşənlər</a>
        </nav>
      </div>
    </main>
  );
}
