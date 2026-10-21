export type FantasyPosition = "GK" | "DEF" | "MID" | "FWD";

export type FantasyPriceRow = {
  player_id: string;
  player_name: string;
  team_id: string;
  team_name: string;
  league_id: string;
  league_name: string;
  position: FantasyPosition;
  market_value_eur: "";
  currency: "EUR";
  price_source: "transfermarkt_manual";
  source_url: "";
  valued_at: "";
};

const headers: (keyof FantasyPriceRow)[] = [
  "player_id",
  "player_name",
  "team_id",
  "team_name",
  "league_id",
  "league_name",
  "position",
  "market_value_eur",
  "currency",
  "price_source",
  "source_url",
  "valued_at",
];

export function normalizeFantasyPosition(position: string): FantasyPosition | null {
  const normalized = position.trim().toLowerCase();
  if (normalized === "goalkeeper") return "GK";
  if (normalized === "defender") return "DEF";
  if (normalized === "midfielder") return "MID";
  if (normalized === "attacker" || normalized === "forward") return "FWD";
  return null;
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function fantasyPriceRowsToCsv(rows: FantasyPriceRow[]) {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header])).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
