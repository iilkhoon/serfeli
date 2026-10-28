"use client";
import { useEffect, useEffectEvent, useState } from "react";
import { Play, Pause, RefreshCw, Database, ArrowUpRight } from "lucide-react";
import { api, errorMessage } from "./ui";
import type { CrawlRuntime } from "../lib/crawl-jobs";
type Job = {
  id: string;
  sourceId: string;
  status: string;
  phase: string;
  discovered: number;
  processed: number;
  imported: number;
  failed: number;
  skipped: number;
  pendingMaps: number;
  readMaps: number;
  nextRunAt: number;
  lastError?: string;
  lastUrl?: string;
  recent: { url: string; error: string }[];
  busy?: boolean;
};
type Source = { id: string; name: string; root: string };
type JobsResponse = { sources: Source[]; jobs: Job[]; runtime: CrawlRuntime | null };
const names: Record<string, string> = {
  discovering: "Sitemap mərhələsi",
  importing: "Məhsul mərhələsi",
  waiting: "Mənbənin gözləmə müddəti",
  paused: "Dayandırılıb",
  blocked: "Yoxlama tələb olunur",
  complete: "Tapılan URL-lər tamamlanıb",
};
export default function CrawlPanel({
  onCatalogRefresh,
}: {
  onCatalogRefresh: () => Promise<unknown>;
}) {
  const [sources, setSources] = useState<Source[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [sourceId, setSourceId] = useState("baku"),
    [runningId, setRunningId] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [runtime, setRuntime] = useState<CrawlRuntime | null>(null);
  const update = (j: Job) => setJobs((old) => [j, ...old.filter((x) => x.id !== j.id)]);
  const reload = async () => {
    const data = await api<JobsResponse>("admin/jobs");
    setSources(data.sources);
    setJobs(data.jobs);
    setRuntime(data.runtime);
  };
  useEffect(() => {
    let cancelled = false;
    let loading = false;
    const poll = () => {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      api<JobsResponse>("admin/jobs")
        .then(
          (data) => {
            if (cancelled) return;
            setSources(data.sources);
            setJobs(data.jobs);
            setRuntime(data.runtime);
            setError("");
          },
          (e) => !cancelled && setError(errorMessage(e)),
        )
        .finally(() => {
          loading = false;
        });
    };
    poll();
    const timer = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  const refreshCatalog = useEffectEvent(() => void onCatalogRefresh());
  useEffect(() => {
    if (!runningId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = async () => {
      try {
        const job = await api<Job>("admin/jobs/tick", { id: runningId });
        if (cancelled) return;
        update(job);
        if (["complete", "paused", "blocked"].includes(job.status)) {
          setRunningId(null);
          if (job.status === "complete") refreshCatalog();
          return;
        }
        timer = setTimeout(
          step,
          Math.min(60000, Math.max(1700, (job.nextRunAt || 0) - Date.now())),
        );
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
          setRunningId(null);
        }
      }
    };
    void step();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runningId]);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const job = await api<Job>("admin/jobs/start", { sourceId });
      update(job);
      if (!["paused", "blocked", "complete"].includes(job.status)) setRunningId(job.id);
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  };
  const control = async (job: Job, action: "pause" | "resume") => {
    setBusy(true);
    setError("");
    if (action === "pause") setRunningId(null);
    try {
      const next = await api<Job>("admin/jobs/control", { id: job.id, action });
      update(next);
      if (action === "resume") setRunningId(job.id);
      else void onCatalogRefresh();
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  };
  const runtimeFresh =
    runtime && Date.now() - (runtime.completedAt || runtime.startedAt) < 5 * 60000;
  return (
    <article className="admin-panel crawl-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">D1-DƏ SAXLANAN İDXAL NÖVBƏSİ</span>
          <h2>Sitemap-dən məhsul idxalı</h2>
        </div>
        <Database size={23} />
      </div>
      <p className="form-help">
        Məhsul adı, AZN qiyməti, şəkli və stok məlumatı oxunan səhifələr kataloqa yazılır. Hər
        sorğuda bir URL işlənir. Mövqe bazada qalır. Panel açıq olduqda idxalı idarə edə bilərsən;
        panel bağlı ikən davam etməsi aşağıdakı fon icrası qeydi ilə yoxlanır.
      </p>
      <div
        className={
          "crawl-runtime " +
          (runtimeFresh && runtime?.status !== "error" ? "observed" : "unconfirmed")
        }
        role="status"
      >
        <Database size={20} />
        <div>
          <strong>
            {!runtime
              ? "Fon icrası hələ təsdiqlənməyib"
              : !runtimeFresh
                ? "Fon icrasından yeni siqnal gəlməyib"
                : runtime.status === "error"
                  ? "Son fon icrasında xəta var"
                  : runtime.status === "running"
                    ? "Fon idxalı işləyir"
                    : "Son fon icrası qeydə alınıb"}
          </strong>
          <p>
            {runtime
              ? `${new Date(runtime.completedAt || runtime.startedAt).toLocaleString("az-AZ", { timeZone: "Asia/Baku" })} · ${runtime.jobs} aktiv iş · ${runtime.ticks} addım · ${runtime.errors.length} xəta`
              : "Cron konfiqurasiyası təkbaşına işləməsini sübut etmir. İlk server icrası burada vaxtı və nəticəsi ilə görünəcək."}
          </p>
          {runtime?.errors.map((failure, i) => (
            <p className="crawl-error" key={i}>
              {failure.message}
            </p>
          ))}
          <small>
            Vəziyyət panel açıq olduqda 15 saniyədən bir yenilənir. Dayandırılmış işlər fon icrasına
            daxil edilmir.
          </small>
        </div>
      </div>
      <div className="crawl-start">
        <label>
          Mağaza
          <select
            value={sourceId}
            disabled={!!runningId || busy}
            onChange={(e) => setSourceId(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="dark-button"
          disabled={busy || !!runningId || !sources.length}
          onClick={start}
        >
          <Play size={16} />
          İdxalı hazırla və başlat
        </button>
        <button
          className="outline-button"
          disabled={busy}
          onClick={() => reload().catch((e) => setError(errorMessage(e)))}
        >
          <RefreshCw size={16} />
          Vəziyyəti yenilə
        </button>
      </div>
      <p className="form-help">
        Mağaza üzrə paralel sorğu kilidi və fasilə var. 429 cavabında Retry-After gözlənilir;
        401/403 cavabında iş dayanır. Kateqoriya, silinmiş və qiyməti oxunmayan səhifələr məhsul
        sayılmır.
      </p>
      {error && (
        <p role="alert" className="crawl-error">
          {error}
        </p>
      )}
      {jobs.map((job) => (
        <section className="crawl-job" key={job.id}>
          <div className="crawl-job-heading">
            <h3>{sources.find((s) => s.id === job.sourceId)?.name || job.sourceId}</h3>
            <span
              className={
                "badge " +
                (job.status === "complete" ? "green" : job.status === "blocked" ? "red" : "neutral")
              }
            >
              {names[job.status] || job.status}
              {runningId === job.id ? " · davam edir" : ""}
            </span>
          </div>
          <div className="crawl-stats">
            <span>
              <b>{job.discovered.toLocaleString("az-AZ")}</b>namizəd URL
            </span>
            <span>
              <b>{job.processed.toLocaleString("az-AZ")}</b>yoxlanıb
            </span>
            <span>
              <b>{job.imported.toLocaleString("az-AZ")}</b>idxal edilib
            </span>
            <span>
              <b>{job.failed + job.skipped}</b>oxunmayıb
            </span>
          </div>
          {job.discovered > 0 && (
            <progress aria-label="Yoxlanmış URL-lər" max={job.discovered} value={job.processed} />
          )}
          <p className="micro muted">
            Sitemap/kateqoriya: {job.readMaps} oxunub · {job.pendingMaps} növbədə. İdxal sayı
            yoxlanmış səhifə sayıdır; təkrar URL mövcud məhsulu yeniləyə bilər.
          </p>
          {job.lastError && (
            <p role="status" className="crawl-error">
              {job.lastError}
            </p>
          )}
          {job.lastUrl && (
            <a className="crawl-last" href={job.lastUrl} target="_blank" rel="noopener noreferrer">
              Son URL: {job.lastUrl}
              <ArrowUpRight size={13} />
            </a>
          )}
          <div className="form-actions">
            {job.status !== "complete" &&
              (runningId === job.id ? (
                <button
                  className="outline-button"
                  disabled={busy}
                  onClick={() => control(job, "pause")}
                >
                  <Pause size={15} />
                  Dayandır
                </button>
              ) : (
                <button
                  className="outline-button"
                  disabled={busy || !!runningId}
                  onClick={() => control(job, "resume")}
                >
                  <Play size={15} />
                  {job.status === "blocked" ? "Mənbəni yenidən yoxla" : "Qaldığı yerdən davam et"}
                </button>
              ))}
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => onCatalogRefresh().catch((e) => setError(errorMessage(e)))}
            >
              Kataloqu yenilə
            </button>
          </div>
          {job.recent.length > 0 && (
            <details>
              <summary>Son oxuma xətaları ({job.recent.length})</summary>
              {job.recent.map((r, i) => (
                <p className="micro" key={i}>
                  {r.url}
                  <br />
                  {r.error}
                </p>
              ))}
            </details>
          )}
        </section>
      ))}
    </article>
  );
}
