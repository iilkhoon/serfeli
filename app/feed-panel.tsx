"use client";
import { useState } from "react";
import { RefreshCw, CheckCircle2, ArrowUpRight, ScanLine } from "lucide-react";
import { api, errorMessage } from "./ui";
import type { AdminData, FeedStatus } from "./types";
import type { normalizeTechnomania } from "../lib/technomania";
import { money } from "../lib/catalog";
type FeedPreview = ReturnType<typeof normalizeTechnomania>;
export default function FeedPanel({
  data,
  onImported,
  toast,
}: {
  data: AdminData | null;
  onImported: () => Promise<unknown>;
  toast: (message: string) => void;
}) {
  const [preview, setPreview] = useState<FeedPreview | null>(null),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<FeedStatus | null>(null);
  const last = result || data?.feed?.find((f) => f.id === "technomania");
  return (
    <section className="admin-panel official-feed">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <CheckCircle2 size={14} />
            RƏSMİ MƏLUMAT BAĞLANTISI
          </span>
          <h2>Technomania kataloq feed-i</h2>
          <p className="form-help">
            Məhsul, rəng variantı, şəkil, nağd qiymət, stok və 6/12/18 aylıq taksit yekunu.
          </p>
        </div>
        <img src="/logos/technomania.png" alt="Technomania" width="42" height="42" />
      </div>
      <a
        className="feed-source-link"
        href="https://technomania.az/api/catalog/feed?format=json"
        target="_blank"
        rel="noreferrer"
      >
        technomania.az/api/catalog/feed?format=json <ArrowUpRight size={14} />
      </a>
      {last && (
        <div className="feed-status">
          <span className="badge green">Bağlantı aktivdir</span>
          <span>
            {last.sourceCount} məhsul · {last.variantCount} variant · {last.inStock} stokda
          </span>
          <small>
            {new Date(last.checkedAt).toLocaleString("az-AZ", { timeZone: "Asia/Baku" })}
          </small>
        </div>
      )}
      <p className="form-help">
        Rənglər ayrı variant kimi saxlanılır. Avtomatik uyğunlaşma yalnız dəqiq model/yaddaş/rəng
        təsdiqlənəndə edilir. Stokda olmayan təkliflər ucuz təklif sırasına çıxarılmır. Feed uğursuz
        olarsa mövcud kataloq saxlanılır.
      </p>
      <div className="feed-actions">
        <button
          className="outline-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setPreview(await api<FeedPreview>("admin/feed-preview", {}));
            } catch (e) {
              toast(errorMessage(e));
            }
            setBusy(false);
          }}
        >
          <ScanLine size={17} />
          {busy ? "Oxunur…" : "Feed-i önizlə"}
        </button>
        <button
          className="dark-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api<FeedStatus>("admin/feed-sync", {});
              setResult(r);
              await onImported();
              toast(`${r.sourceCount} məhsul / ${r.variantCount} variant yeniləndi.`);
            } catch (e) {
              toast(errorMessage(e));
            }
            setBusy(false);
          }}
        >
          <RefreshCw size={17} />
          {busy ? "Yenilənir…" : "Kataloqu indi yenilə"}
        </button>
      </div>
      {preview && (
        <div className="feed-preview">
          <h3>
            {preview.sourceCount} məhsul → {preview.variantCount} variant
          </h3>
          <p className="form-help">
            {preview.inStock} variant stokdadır · {preview.mapped} dəqiq uyğunlaşma ·{" "}
            {preview.warnings.length} format qeydi. Aşağıda ilk 20 variant göstərilir.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Məhsul / variant</th>
                  <th>Nağd qiymət</th>
                  <th>Stok</th>
                </tr>
              </thead>
              <tbody>
                {preview.products.slice(0, 20).map((p, i) => {
                  const o = preview.offers[i];
                  return (
                    <tr key={p.id}>
                      <td>
                        <b>{p.name}</b>
                        <br />
                        <small>{p.variant}</small>
                      </td>
                      <td>{money(o.price)}</td>
                      <td>
                        <span className={"badge " + (o.stock ? "green" : "neutral")}>
                          {o.stock ? "Stokda" : "Mövcud deyil"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
