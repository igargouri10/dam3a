import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { formatPredictionValue, getPredictionHistory, type HistoryRow } from "@/lib/data/analytics";
import { getSeasonPredictionHistory } from "@/lib/data/submitted-predictions";
import { getFixtures } from "@/lib/data/fixtures";

export const dynamic = "force-dynamic";

const seasonLabels: Record<string, string> = {
  FINAL_TABLE: "Final table", WINNER: "Competition winner", MOST_CLEAN_SHEETS: "Most clean sheets",
  TOP_SCORER: "Top scorer", TOP_ASSISTER: "Top assister",
};

function groupMatchPredictions(rows: HistoryRow[]) {
  const groups = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    const key = [row.competition, row.kickoffAt, row.homeTeam, row.awayTeam].join("|");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}

function matchPickValue(row: HistoryRow) {
  if (row.selectedValue === "HOME") return row.homeTeam;
  if (row.selectedValue === "AWAY") return row.awayTeam;
  return formatPredictionValue(row.selectedValue);
}

function groupStatus(rows: HistoryRow[]) {
  const statuses = [...new Set(rows.map((row) => row.status))];
  return statuses.length === 1 ? statuses[0] : "MIXED";
}

export default async function MyPredictions() {
  const [matchData, seasonRows, { matches }] = await Promise.all([getPredictionHistory(), getSeasonPredictionHistory(), getFixtures()]);
  if (!matchData.signedIn) return <div className="empty"><h2>Your predictions are private</h2><p>Sign in to see every submitted pick.</p><Link className="save" href="/auth/sign-in">Sign in</Link></div>;

  const teamNames = new Map(matches.flatMap((match) => [[match.home.id, match.home.name] as const, [match.away.id, match.away.name] as const]));
  const display = (value: unknown) => Array.isArray(value)
    ? value.map((id, index) => `${index + 1}. ${teamNames.get(String(id)) ?? id}`).join(" · ")
    : typeof value === "string" ? (teamNames.get(value) ?? formatPredictionValue(value)) : formatPredictionValue(value);
  const matchGroups = groupMatchPredictions(matchData.rows);

  return <>
    <div className="page-title"><span className="eyebrow">Your prediction library</span><h1>My picks</h1><p>Match calls and season forecasts in one place.</p></div>
    <div className="prediction-library-tabs"><a href="#season">Season picks</a><a href="#matches">Match picks</a></div>
    <section id="season" className="prediction-library">
      <h2>Season predictions</h2>
      {seasonRows.map((row) => <article className="submitted-pick" key={row.predictionId}><div><small>{row.competition}</small><h3>{seasonLabels[row.predictionCode] ?? row.predictionCode}</h3><p>{display(row.selectedValue)}</p></div><span className="pick-status">{row.status}</span></article>)}
      {!seasonRows.length && <div className="empty compact">No season predictions submitted yet. <Link href="/season-picks">Make your picks</Link></div>}
    </section>
    <section id="matches" className="prediction-library">
      <div className="prediction-section-head"><div><h2>Match predictions</h2><p>{matchGroups.length} matches · {matchData.rows.length} picks</p></div></div>
      <div className="match-pick-grid">
        {matchGroups.map((rows) => {
          const match = rows[0], status = groupStatus(rows);
          return <details className="match-pick-card" key={`${match.competition}-${match.kickoffAt}-${match.homeTeam}-${match.awayTeam}`}>
            <summary><div className="match-pick-summary"><small>{match.competition} · {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(match.kickoffAt))}</small><h3><span>{match.homeTeam}</span><em>vs</em><span>{match.awayTeam}</span></h3><span className="pick-count">{rows.length} pick{rows.length === 1 ? "" : "s"}</span></div><div className="match-pick-meta"><span className={`pick-status ${status.toLowerCase()}`}>{status}</span><ChevronDown className="match-pick-chevron" size={18}/></div></summary>
            <div className="match-pick-list">{rows.map((row) => <div className="match-pick-line" key={row.predictionId}><div><span>{row.predictionName}</span><b>{matchPickValue(row)}</b></div><span className={`pick-result ${row.status.toLowerCase()}`}>{row.status === "PENDING" ? "Awaiting result" : `${row.status} · ${row.points > 0 ? "+" : ""}${row.points} pts`}</span></div>)}</div>
          </details>;
        })}
      </div>
      {!matchData.rows.length && <div className="empty compact">No match predictions submitted yet.</div>}
    </section>
  </>;
}
