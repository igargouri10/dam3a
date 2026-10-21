import { Banknote, CalendarClock, Repeat2, ShieldCheck, Shirt, Star } from "lucide-react";
import FantasyTestBuilder from "./FantasyTestBuilder";
import "./fantasy.css";

const positions = [
  { code: "GK", label: "Goalkeeper", count: 1 },
  { code: "DEF", label: "Defenders", count: 5 },
  { code: "MID", label: "Midfielders", count: 6 },
  { code: "FWD", label: "Forwards", count: 4 },
];

const scoring = [
  ["Goal", "+10 GK · +8 DEF · +6 MID · +4 FWD"],
  ["Assist", "+5 GK · +4 DEF · +3 MID/FWD"],
  ["Clean sheet", "+4 GK/DEF · +2 MID · +1 FWD"],
  ["Cards", "−4 yellow · −10 red"],
  ["Man of the match", "+10 to every tied highest-rated player"],
  ["Captain", "Double points; vice-captain covers a captain who does not play"],
];

export default function FantasyPage() {
  return <div className="fantasy-page">
    <section className="fantasy-hero">
      <div>
        <span className="eyebrow">DAM3A Fantasy</span>
        <h1>Build your squad.<br/>Own the gameweek.</h1>
        <p>Pick 16 players across Europe’s top five leagues, confirm your starting XI, and compete every week.</p>
        <div className="fantasy-hero-meta">
          <span><Banknote size={16}/>€1bn budget</span>
          <span><CalendarClock size={16}/>Friday 16:59 UTC deadline</span>
        </div>
      </div>
      <div className="fantasy-shirt" aria-hidden="true"><Shirt size={104}/><b>D3</b></div>
    </section>

    <FantasyTestBuilder />

    <div className="fantasy-grid">
      <section className="fantasy-panel">
        <div className="fantasy-panel-title"><ShieldCheck size={20}/><h2>Your 16-player squad</h2></div>
        <p>Start 11 players and order five substitutes. The first eligible bench player automatically replaces a starter who plays zero minutes.</p>
        <div className="fantasy-positions">
          {positions.map((position) => <div key={position.code}><b>{position.count}</b><span>{position.code}</span><small>{position.label}</small></div>)}
        </div>
      </section>

      <section className="fantasy-panel">
        <div className="fantasy-panel-title"><Repeat2 size={20}/><h2>Transfers and deadlines</h2></div>
        <ul>
          <li>Unlimited changes while creating your initial squad.</li>
          <li>One free transfer added after each completed gameweek.</li>
          <li>Transfers accumulate up to a maximum of 10.</li>
          <li>Confirmed changes take effect from the next gameweek.</li>
        </ul>
      </section>
    </div>

    <section className="fantasy-panel fantasy-scoring">
      <div className="fantasy-panel-title"><Star size={20}/><h2>How players earn points</h2></div>
      <div className="fantasy-score-grid">
        {scoring.map(([title, detail]) => <div key={title}><b>{title}</b><span>{detail}</span></div>)}
      </div>
    </section>
  </div>;
}
