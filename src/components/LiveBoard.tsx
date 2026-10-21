"use client";

import { useEffect, useState } from "react";
import { TeamCrest } from "@/components/TeamCrest";
import type { LiveSnapshot } from "@/lib/data/live";

export function LiveBoard({ initial, demo }: { initial: LiveSnapshot[]; demo: boolean }) {
  const [matches, setMatches] = useState(initial);
  const [updated, setUpdated] = useState(new Date());

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const response = await fetch("/api/live");
        if (response.ok) {
          const data = await response.json();
          setMatches(data.matches);
          setUpdated(new Date(data.refreshedAt));
        }
      } catch {}
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!matches.length) return <div className="empty"><h2>No matches live right now</h2><p>The match centre wakes up automatically at kickoff.</p></div>;

  return <>
    <div className="live-toolbar"><span><i /> Live match centre</span><small>{demo ? "Preview data · " : ""}Updated {updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small></div>
    {matches.map(match => <article className="live-board" key={match.id}>
      <div className="live-score-head"><span>{match.competition} · {match.round}</span><span className="live-clock">LIVE</span></div>
      <div className="live-score">
        <div><TeamCrest team={{ ...match.home, color: "#16342b" }} size={58} /><b>{match.home.name}</b><small>{match.home.shortName}</small></div>
        <strong>{match.home.score ?? 0}<i>:</i>{match.away.score ?? 0}</strong>
        <div><TeamCrest team={{ ...match.away, color: "#283f6b" }} size={58} /><b>{match.away.name}</b><small>{match.away.shortName}</small></div>
      </div>
      <div className="live-columns">
        <section><h3>Match timeline</h3><div className="timeline">{match.events.map((event, index) => <div className="event" key={`${event.minute}-${index}`}><span>{event.minute}{event.extraMinute ? `+${event.extraMinute}` : ""}′</span><i className={event.type.toLowerCase()} /><div><b>{event.playerName ?? event.detail}</b><small>{event.detail}</small></div></div>)}</div></section>
        <section><h3>Match statistics</h3><Stat label="Shots on target" home={match.statistics.home.shotsOnTarget} away={match.statistics.away.shotsOnTarget} /><Stat label="Corners" home={match.statistics.home.corners} away={match.statistics.away.corners} /></section>
      </div>
    </article>)}
  </>;
}

function Stat({ label, home, away }: { label: string; home: number | null; away: number | null }) {
  const total = (home ?? 0) + (away ?? 0) || 1;
  return <div className="live-stat"><div><b>{home ?? "–"}</b><span>{label}</span><b>{away ?? "–"}</b></div><div className="stat-track"><i style={{ width: `${((home ?? 0) / total) * 100}%` }} /><i style={{ width: `${((away ?? 0) / total) * 100}%` }} /></div></div>;
}
