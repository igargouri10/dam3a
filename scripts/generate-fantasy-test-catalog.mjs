import fs from "node:fs/promises";

const sourcePath = "C:/Users/igarg/Documents/Codex/2026-08-10/explore/.tmp-csv-audit/source-data.json";
const outputPath = new URL("../src/data/fantasy-test-players.json", import.meta.url);
const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const values = source.complete_csv.values;
const headers = values[0].map((value) => String(value ?? "").replace(/^\uFEFF/, "").trim());
const positionBase = { GK: 8_000_000, DEF: 16_000_000, MID: 20_000_000, FWD: 24_000_000 };

const players = values.slice(1).map((row) => {
  const item = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
  const playerId = String(item.player_id);
  const variation = (Number(playerId) % 21) * 500_000;
  return {
    id: `${playerId}:${item.team_id}`,
    name: String(item.player_name),
    teamId: String(item.team_id),
    team: String(item.team_name),
    league: String(item.league_name),
    position: String(item.position),
    price: positionBase[item.position] + variation,
  };
});

const tableObjects = (key) => {
  const matrix = source[key].values;
  const columns = matrix[0].map((value) => String(value ?? "").replace(/^\uFEFF/, "").trim());
  return matrix.slice(1).map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ""])));
};
const idRows = tableObjects("edited_csv");
const filledRows = tableObjects("filled_xlsx");
const verifiedByPlayerTeam = new Map();
for (let index = 0; index < idRows.length; index += 1) {
  const identity = idRows[index];
  const filled = filledRows[index] ?? {};
  let price = Number(filled.market_value_eur);
  if (!(price > 0) && /barcelona/i.test(String(identity.team_name))) {
    const thousands = Number(String(identity.market_value_eur ?? "").replace(/[^0-9]/g, ""));
    if (thousands > 0) price = thousands * 1000;
  }
  if (price > 0) verifiedByPlayerTeam.set(`${identity.player_id}:${identity.team_id}`, price);
}
const verifiedPlayers = players.flatMap((player) => {
  const price = verifiedByPlayerTeam.get(player.id);
  return price ? [{ ...player, price }] : [];
});

await fs.mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(players)}\n`, "utf8");
await fs.writeFile(new URL("../src/data/fantasy-priced-players.json", import.meta.url), `${JSON.stringify(verifiedPlayers)}\n`, "utf8");
console.log(`Generated ${players.length} temporary and ${verifiedPlayers.length} verified-price fantasy players.`);
