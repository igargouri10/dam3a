"use client";

import { useEffect, useState } from "react";
import "./fantasy-download.css";

const fileName = "dam3a-fantasy-player-prices-2026-27.csv";

export default function FantasyPriceDownloadPage() {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready to prepare the complete 96-club catalogue.");
  const [loading, setLoading] = useState(false);

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  async function prepareDownload() {
    setLoading(true);
    setStatus("Preparing all five leagues. This can take about a minute…");
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    try {
      const response = await fetch("/api/fantasy/prices/template?version=complete-96", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? `Download failed (${response.status})`);
      }
      const csv = await response.blob();
      setDownloadUrl(URL.createObjectURL(csv));
      setStatus("Your complete CSV is ready. Select Save CSV below.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The CSV could not be prepared.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <div className="page-title">
      <span className="eyebrow">Fantasy administration</span>
      <h1>Player price catalogue</h1>
      <p>Download every current squad from the Premier League, La Liga, Serie A, Bundesliga, and Ligue 1.</p>
    </div>
    <section className="fantasy-download-card">
      <div>
        <h2>2026/27 price template</h2>
        <p aria-live="polite">{status}</p>
      </div>
      <div className="fantasy-download-actions">
        <button className="save" type="button" onClick={prepareDownload} disabled={loading}>
          {loading ? "Preparing…" : downloadUrl ? "Prepare again" : "Prepare CSV"}
        </button>
        {downloadUrl ? <a className="save fantasy-save-link" href={downloadUrl} download={fileName}>Save CSV</a> : null}
      </div>
    </section>
  </>;
}
