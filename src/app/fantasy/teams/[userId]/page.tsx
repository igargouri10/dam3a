import Link from "next/link";
import { ArrowLeft, Banknote, Crown, Shield, Trophy, Users } from "lucide-react";
import { callPublicRpc } from "@/lib/supabase/server";
import "../../fantasy.css";
import "./team.css";

type Position = "GK" | "DEF" | "MID" | "FWD";
type PublicPlayer = { id: string; name: string; team: string; position: Position; price: number; starter: boolean; benchOrder: number | null };
type PublicTeam = { userId: string; username: string; captain: string; viceCaptain: string; totalCost: number; confirmedAt: string; points: number; players: PublicPlayer[] };

function money(value: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default async function PublicFantasyTeamPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  let team: PublicTeam | null = null;
  let error = "";
  try {
    team = await callPublicRpc<PublicTeam | null>("get_public_fantasy_team", { target_user_id: userId });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Could not load this fantasy team.";
  }

  if (!team) return <div className="public-team-page"><Link className="public-team-back" href="/fantasy"><ArrowLeft size={16}/>Back to Fantasy</Link><section className="public-team-empty"><Users size={30}/><h1>Fantasy team unavailable</h1><p>{error || "This manager has not confirmed a squad yet."}</p></section></div>;

  const starters = team.players.filter((player) => player.starter);
  const bench = team.players.filter((player) => !player.starter).sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99));

  return <div className="public-team-page">
    <Link className="public-team-back" href="/fantasy"><ArrowLeft size={16}/>Back to Fantasy</Link>
    <section className="public-team-hero">
      <div><span className="eyebrow">Fantasy manager</span><h1>{team.username}&apos;s team</h1><p>Confirmed DAM3A squad and starting XI.</p></div>
      <div className="public-team-stats"><span><Trophy size={16}/><b>{team.points} pts</b></span><span><Banknote size={16}/><b>{money(team.totalCost)}</b></span></div>
    </section>
    <div className="public-team-layout">
      <section className="fantasy-pitch public-team-pitch" aria-label={`${team.username}'s starting eleven`}>
        <div className="fantasy-pitch-heading"><span><Shield size={14}/> Starting XI</span><small>11/11</small></div>
        <div className="fantasy-pitch-markings" aria-hidden="true"><span/><span/></div>
        <div className="fantasy-pitch-lineup">{(["FWD", "MID", "DEF", "GK"] as Position[]).map((position) => <div className={`fantasy-pitch-line fantasy-pitch-${position.toLowerCase()}`} key={position}>{starters.filter((player) => player.position === position).map((player) => <div className="fantasy-pitch-player" key={player.id}><span>{player.name.split(" ").map((part) => part[0]).join("").slice(0,2)}</span><b>{player.name}</b>{team.captain === player.id ? <em>C</em> : team.viceCaptain === player.id ? <em>V</em> : null}</div>)}</div>)}</div>
      </section>
      <aside className="public-team-bench"><h2>Bench</h2>{bench.map((player) => <div key={player.id}><span>{player.benchOrder}</span><p><b>{player.name}</b><small>{player.team} · {player.position}</small></p><strong>{money(player.price)}</strong></div>)}<div className="public-team-captains"><p><Crown size={14}/>Captain <b>{team.players.find((player) => player.id === team.captain)?.name}</b></p><p><Shield size={14}/>Vice-captain <b>{team.players.find((player) => player.id === team.viceCaptain)?.name}</b></p></div></aside>
    </div>
  </div>;
}
