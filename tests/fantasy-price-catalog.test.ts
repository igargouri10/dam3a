import { describe, expect, it } from "vitest";
import { fantasyPriceRowsToCsv, normalizeFantasyPosition } from "../src/lib/fantasy/price-catalog";

describe("fantasy price catalogue", () => {
  it("normalizes API-Football positions", () => {
    expect(normalizeFantasyPosition("Goalkeeper")).toBe("GK");
    expect(normalizeFantasyPosition("Defender")).toBe("DEF");
    expect(normalizeFantasyPosition("Midfielder")).toBe("MID");
    expect(normalizeFantasyPosition("Attacker")).toBe("FWD");
    expect(normalizeFantasyPosition("Coach")).toBeNull();
  });

  it("writes an Excel-friendly CSV and escapes names", () => {
    const csv = fantasyPriceRowsToCsv([{
      player_id: "1", player_name: 'Doe, "John"', team_id: "2", team_name: "DAM3A FC",
      league_id: "39", league_name: "Premier League", position: "FWD", market_value_eur: "",
      currency: "EUR", price_source: "transfermarkt_manual", source_url: "", valued_at: "",
    }]);
    expect(csv.startsWith("\uFEFFplayer_id,")).toBe(true);
    expect(csv).toContain('"Doe, ""John"""');
  });
});
