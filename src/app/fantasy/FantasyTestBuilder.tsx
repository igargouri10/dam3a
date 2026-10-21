"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Eye, Search, Shield, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import catalog from "@/data/fantasy-priced-players.json";

type Position = "GK" | "DEF" | "MID" | "FWD";
type Player = { id: string; name: string; teamId: string; team: string; league: string; position: Position; price: number };
type StoredSquad = { players?: { id: string; starter: boolean; benchOrder: number | null }[]; captain?: string; viceCaptain?: string };
type FantasyLeader = { rank: number; user_id: string; username: string; points: number; gameweeks: number };
type PlayerSort = "name" | "price-desc" | "price-asc";
type FantasyMode = "transfers" | "lineup" | "team";
type FantasyStatus = { nextDeadline: string | null; seasonEnded: boolean; unlimitedTransfers: boolean; remainingTransfers: number };

const players = catalog as Player[];
const limits: Record<Position, number> = { GK: 1, DEF: 5, MID: 6, FWD: 4 };
const budget = 1_000_000_000;

function money(value: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "EUR", maximumFractionDigits: 1, notation: "compact" }).format(value);
}

function countdown(deadline: string | null, now: number) {
  if (!deadline) return "Season complete";
  const seconds = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s`;
}

export default function FantasyTestBuilder() {
  const [mode, setMode] = useState<FantasyMode>("transfers");
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState("ALL");
  const [position, setPosition] = useState<Position | "ALL">("ALL");
  const [team, setTeam] = useState("ALL");
  const [sort, setSort] = useState<PlayerSort>("name");
  const [selected, setSelected] = useState<string[]>([]);
  const [starters, setStarters] = useState<string[]>([]);
  const [captain, setCaptain] = useState("");
  const [viceCaptain, setViceCaptain] = useState("");
  const [message, setMessage] = useState("Loading your saved fantasy squad…");
  const [leaders, setLeaders] = useState<FantasyLeader[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [fantasyStatus, setFantasyStatus] = useState<FantasyStatus>({ nextDeadline: null, seasonEnded: false, unlimitedTransfers: true, remainingTransfers: 0 });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    Promise.all([
      fetch("/api/fantasy/squad", { cache: "no-store" }).then(async (response) => ({ ok: response.ok, data: await response.json() as StoredSquad & { error?: string } })),
      fetch("/api/fantasy/leaderboard", { cache: "no-store" }).then((response) => response.json() as Promise<{ rows?: FantasyLeader[] }>),
      fetch("/api/fantasy/status", { cache: "no-store" }).then((response) => response.json() as Promise<FantasyStatus>),
    ]).then(([squadResult, leaderboardResult, statusResult]) => {
      setLeaders(leaderboardResult.rows ?? []);
      if (statusResult.nextDeadline !== undefined) setFantasyStatus(statusResult);
      if (!squadResult.ok) return setMessage(squadResult.data.error ?? "Sign in to save a fantasy squad.");
      const storedPlayers = squadResult.data.players ?? [];
      setSelected(storedPlayers.map((player) => player.id));
      setStarters(storedPlayers.filter((player) => player.starter).map((player) => player.id));
      setCaptain(squadResult.data.captain ?? "");
      setViceCaptain(squadResult.data.viceCaptain ?? "");
      setMessage(storedPlayers.length ? "Your saved fantasy squad has been restored from DAM3A." : "Choose your 16-player squad from the currently priced player pool.");
    }).catch(() => setMessage("Could not load the fantasy service. Apply migration 015 and try again."));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const byId = useMemo(() => new Map(players.map((player) => [player.id, player])), []);
  const squad = selected.flatMap((id) => byId.get(id) ?? []);
  const cost = squad.reduce((sum, player) => sum + player.price, 0);
  const counts = squad.reduce<Record<Position, number>>((total, player) => {
    total[player.position] += 1;
    return total;
  }, { GK: 0, DEF: 0, MID: 0, FWD: 0 });
  const leagues = useMemo(() => Array.from(new Set(players.map((player) => player.league))).sort(), []);
  const teams = useMemo(() => Array.from(new Set(players
    .filter((player) => league === "ALL" || player.league === league)
    .map((player) => player.team))).sort(), [league]);
  const startingEleven = squad.filter((player) => starters.includes(player.id));
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = players.filter((player) =>
      (league === "ALL" || player.league === league) &&
      (position === "ALL" || player.position === position) &&
      (team === "ALL" || player.team === team) &&
      (!needle || `${player.name} ${player.team} ${player.league}`.toLowerCase().includes(needle)),
    );
    filtered.sort((a, b) => sort === "price-desc"
      ? b.price - a.price || a.name.localeCompare(b.name)
      : sort === "price-asc"
        ? a.price - b.price || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name));
    return filtered.slice(0, 80);
  }, [league, position, query, sort, team]);

  function changeLeague(value: string) {
    setLeague(value);
    setTeam("ALL");
  }

  function addPlayer(player: Player) {
    if (selected.includes(player.id)) return;
    if (selected.length >= 16) return setMessage("Your squad already has 16 players.");
    if (counts[player.position] >= limits[player.position]) return setMessage(`${player.position} allocation is already full.`);
    if (cost + player.price > budget) return setMessage("That player would take the squad over the €1bn budget.");
    const next = [...selected, player.id];
    setSaveStatus("idle");
    setSelected(next);
    if (starters.length < 11) setStarters([...starters, player.id]);
    setMessage(`${player.name} added to your test squad.`);
  }

  function removePlayer(id: string) {
    setSaveStatus("idle");
    setSelected(selected.filter((playerId) => playerId !== id));
    setStarters(starters.filter((playerId) => playerId !== id));
    if (captain === id) setCaptain("");
    if (viceCaptain === id) setViceCaptain("");
  }

  function toggleStarter(id: string) {
    setSaveStatus("idle");
    if (starters.includes(id)) {
      setStarters(starters.filter((playerId) => playerId !== id));
      if (captain === id) setCaptain("");
      if (viceCaptain === id) setViceCaptain("");
    } else if (starters.length < 11) setStarters([...starters, id]);
    else setMessage("The starting lineup already contains 11 players.");
  }

  async function saveSquad() {
    const completePositions = (Object.keys(limits) as Position[]).every((key) => counts[key] === limits[key]);
    if (selected.length !== 16 || !completePositions) { setSaveStatus("error"); return setMessage("Complete the 1 GK, 5 DEF, 6 MID and 4 FWD allocation first."); }
    if (starters.length !== 11) { setSaveStatus("error"); return setMessage("Choose exactly 11 starters."); }
    const effectiveCaptain = captain || starters[0];
    const effectiveViceCaptain = viceCaptain || starters.find((id) => id !== effectiveCaptain) || "";
    if (!effectiveCaptain || !effectiveViceCaptain || effectiveCaptain === effectiveViceCaptain) { setSaveStatus("error"); return setMessage("Choose different captain and vice-captain from your starters."); }
    if (!captain) setCaptain(effectiveCaptain);
    if (!viceCaptain) setViceCaptain(effectiveViceCaptain);
    const bench = squad.filter((player) => !starters.includes(player.id));
    setSaveStatus("idle");
    setSaving(true);
    try {
      const response = await fetch("/api/fantasy/squad", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: squad.map((player) => ({ id: player.id, starter: starters.includes(player.id), benchOrder: starters.includes(player.id) ? null : bench.findIndex((item) => item.id === player.id) + 1 })), captain: effectiveCaptain, viceCaptain: effectiveViceCaptain }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save squad");
      setSaveStatus("success");
      setMessage(mode === "transfers" ? "Team saved. Open View my team to choose your starting XI." : "Starting XI confirmed and saved to your DAM3A account.");
      const leaderboard = await fetch("/api/fantasy/leaderboard", { cache: "no-store" }).then((result) => result.json()) as { rows?: FantasyLeader[] };
      setLeaders(leaderboard.rows ?? []);
    } catch (error) { setSaveStatus("error"); setMessage(error instanceof Error ? error.message : "Could not save squad"); }
    finally { setSaving(false); }
  }

  async function reset() {
    await fetch("/api/fantasy/squad", { method: "DELETE" }).catch(() => null);
    setSelected([]); setStarters([]); setCaptain(""); setViceCaptain("");
    setSaveStatus("idle");
    setMessage("Fantasy squad cleared.");
  }

  return <section className="fantasy-test" aria-labelledby="fantasy-test-title">
    <div className="fantasy-test-heading">
      <div><span className="fantasy-status-pill"><Check size={13}/> SQUAD BUILDING OPEN</span><h2 id="fantasy-test-title">Build your DAM3A squad</h2><p>Choose from {players.length.toLocaleString()} currently priced players across Europe’s top five leagues. Your confirmed squad is saved to your account.</p></div>
      <div className="fantasy-budget"><small>Budget remaining</small><strong>{money(budget - cost)}</strong><span>{selected.length}/16 players · {starters.length}/11 starters</span></div>
    </div>

    <div className="fantasy-workspace-nav" role="tablist" aria-label="Fantasy team management">
      <button className={mode === "transfers" ? "active" : ""} onClick={() => setMode("transfers")} role="tab" aria-selected={mode === "transfers"}>Transfers</button>
      <button className={mode === "lineup" ? "active" : ""} onClick={() => setMode("lineup")} role="tab" aria-selected={mode === "lineup"}>Starting XI</button>
      <div className="fantasy-deadline"><Clock3 size={15}/><span><small>Next deadline</small><b>{countdown(fantasyStatus.nextDeadline, now)}</b></span></div>
      <div className="fantasy-transfers-left"><small>Remaining transfers</small><b>{fantasyStatus.unlimitedTransfers ? "Unlimited" : fantasyStatus.remainingTransfers}</b></div>
    </div>

    <div className={`fantasy-test-layout mode-${mode}`}>
      {mode === "transfers" ? <div className="fantasy-picker">
        <div className="fantasy-filters">
          <label className="fantasy-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player, club or league"/></label>
          <select value={league} onChange={(event) => changeLeague(event.target.value)} aria-label="Filter by league"><option value="ALL">All leagues</option>{leagues.map((value) => <option key={value}>{value}</option>)}</select>
          <select value={position} onChange={(event) => setPosition(event.target.value as Position | "ALL")} aria-label="Filter by position"><option value="ALL">All positions</option>{Object.keys(limits).map((value) => <option key={value}>{value}</option>)}</select>
          <select value={team} onChange={(event) => setTeam(event.target.value)} aria-label="Filter by club"><option value="ALL">All clubs</option>{teams.map((value) => <option key={value}>{value}</option>)}</select>
          <select value={sort} onChange={(event) => setSort(event.target.value as PlayerSort)} aria-label="Sort players"><option value="name">Sort: Player name</option><option value="price-desc">Price: High to low</option><option value="price-asc">Price: Low to high</option></select>
        </div>
        <div className="fantasy-player-list">
          {results.map((player) => {
            const added = selected.includes(player.id);
            const unavailable = !added && (selected.length >= 16 || counts[player.position] >= limits[player.position] || cost + player.price > budget);
            return <button key={`${player.id}-${player.teamId}`} className={added ? "fantasy-player is-selected" : "fantasy-player"} onClick={() => added ? removePlayer(player.id) : addPlayer(player)} disabled={unavailable}>
              <span className={`position-chip position-${player.position.toLowerCase()}`}>{player.position}</span><span><b>{player.name}</b><small>{player.team} · {player.league}</small></span><strong>{money(player.price)}</strong>{added ? <Check size={17}/> : <span className="fantasy-add">+</span>}
            </button>;
          })}
          {!results.length ? <p className="fantasy-empty">No players match those filters.</p> : null}
        </div>
      </div> : null}

      <aside className="fantasy-squad">
        <div className="fantasy-allocation">{(Object.keys(limits) as Position[]).map((key) => <span key={key} className={counts[key] === limits[key] ? "complete" : ""}>{key} {counts[key]}/{limits[key]}</span>)}</div>
        {mode !== "transfers" ? <section className="fantasy-pitch" aria-label="Starting eleven formation">
          <div className="fantasy-pitch-heading"><span><Shield size={14}/> Starting XI</span><small>{startingEleven.length}/11</small></div>
          <div className="fantasy-pitch-markings" aria-hidden="true"><span/><span/></div>
          <div className="fantasy-pitch-lineup">
            {(["FWD", "MID", "DEF", "GK"] as Position[]).map((key) => {
              const line = startingEleven.filter((player) => player.position === key);
              return <div className={`fantasy-pitch-line fantasy-pitch-${key.toLowerCase()}`} key={key}>
                {line.length ? line.map((player) => <button type="button" className="fantasy-pitch-player" key={player.id} onClick={() => mode === "lineup" ? toggleStarter(player.id) : undefined} title={mode === "lineup" ? `Move ${player.name} to the bench` : player.name}>
                  <span>{player.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
                  <b>{player.name}</b>
                  {captain === player.id ? <em>C</em> : viceCaptain === player.id ? <em>V</em> : null}
                </button>) : <span className="fantasy-pitch-empty">Add {key}</span>}
              </div>;
            })}
          </div>
        </section> : null}
        <div className="fantasy-squad-list">
          {(Object.keys(limits) as Position[]).map((key) => <div key={key} className="fantasy-position-group"><h3>{key}</h3>{squad.filter((player) => player.position === key).map((player) => <div className="fantasy-squad-player" key={player.id}>
            <button className={starters.includes(player.id) ? "lineup-toggle starter" : "lineup-toggle"} onClick={() => mode === "lineup" ? toggleStarter(player.id) : undefined}>{starters.includes(player.id) ? "XI" : "BENCH"}</button><span><b>{player.name}</b><small>{player.team}</small></span>{mode === "transfers" ? <button className="icon-button" onClick={() => removePlayer(player.id)} aria-label={`Remove ${player.name}`}><Trash2 size={15}/></button> : <span/>}
          </div>)}{Array.from({ length: limits[key] - counts[key] }, (_, index) => <div className="fantasy-slot" key={index}>Empty {key} slot</div>)}</div>)}
        </div>
        {mode !== "transfers" ? <><label>Captain<select value={captain} disabled={mode === "team"} onChange={(event) => { setCaptain(event.target.value); setSaveStatus("idle"); }}><option value="">Choose captain</option>{squad.filter((player) => starters.includes(player.id)).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label>Vice-captain<select value={viceCaptain} disabled={mode === "team"} onChange={(event) => { setViceCaptain(event.target.value); setSaveStatus("idle"); }}><option value="">Choose vice-captain</option>{squad.filter((player) => starters.includes(player.id)).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label></> : null}
        {mode !== "team" ? <div className="fantasy-test-actions"><button className={saveStatus === "success" ? "save is-saved" : "save"} onClick={saveSquad} disabled={saving}>{saving ? "Saving…" : saveStatus === "success" ? "Saved ✓" : mode === "transfers" ? "Save team" : "Confirm starting XI"}</button><button className="secondary-action" onClick={reset}>Reset</button></div> : null}
        {saveStatus === "success" ? <button className="fantasy-view-team" onClick={() => setMode("team")}><Eye size={16}/> View my team</button> : null}
        <p className={`fantasy-save-feedback is-${saveStatus}`} aria-live="polite">{saving ? "Saving your squad…" : saveStatus === "success" ? "Your squad is confirmed and saved." : saveStatus === "error" ? message : "Your confirmed squad will be stored in your DAM3A account."}</p>
      </aside>
    </div>
    <p className="fantasy-test-message" aria-live="polite">{message}</p>
    <div className="fantasy-leaderboard">
      <div className="fantasy-leaderboard-title"><Trophy size={20}/><div><span className="eyebrow">Fantasy rankings</span><h2>Fantasy leaderboard</h2></div></div>
      <div className="fantasy-leaderboard-row fantasy-leaderboard-header"><span>Rank</span><span>Manager</span><span>Gameweeks</span><span>Points</span></div>
      {leaders.map((leader) => <div className="fantasy-leaderboard-row" key={leader.user_id}><span className="position">#{leader.rank}</span><span><Link className="fantasy-manager-link" href={`/fantasy/teams/${leader.user_id}`}><b>{leader.username}</b><Eye size={13}/></Link></span><span>{leader.gameweeks}</span><strong>{leader.points} pts</strong></div>)}
      {!leaders.length ? <p className="fantasy-empty">No confirmed fantasy squads yet. The first manager to confirm a squad will enter the table with 0 points.</p> : null}
    </div>
  </section>;
}
