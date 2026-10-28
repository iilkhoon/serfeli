export default function NotFound() {
  return (
    <main className="shell empty" style={{ marginTop: 60, marginBottom: 60 }}>
      <h1>Səhifə tapılmadı</h1>
      <p>Bu məhsul və ya səhifə artıq kataloqda mövcud deyil.</p>
      <a className="dark-button" href="/kataloq">
        Məhsulları kəşf et
      </a>
    </main>
  );
}
