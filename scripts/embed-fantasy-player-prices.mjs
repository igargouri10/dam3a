import fs from "node:fs/promises";

const players = JSON.parse(await fs.readFile(new URL("../src/data/fantasy-priced-players.json", import.meta.url), "utf8"));
const migrationUrl = new URL("../supabase/migrations/015_fantasy_squads_and_leaderboard.sql", import.meta.url);
const escape = (value) => `'${String(value).replaceAll("'", "''")}'`;
const statements = [];
for (let start = 0; start < players.length; start += 250) {
  const values = players.slice(start, start + 250).map((player) => {
    const providerPlayerId = player.id.split(":", 1)[0];
    return `(${escape(player.id)},${escape(providerPlayerId)},${escape(player.teamId)},${escape(player.name)},${escape(player.team)},${escape(player.league)},${escape(player.position)},${player.price},'EUR','transfermarkt_manual',true)`;
  });
  statements.push(`insert into public.fantasy_players(id,provider_player_id,team_id,name,team_name,league_name,position,price_eur,currency,price_source,enabled) values\n${values.join(",\n")}\non conflict(id)do update set name=excluded.name,team_name=excluded.team_name,league_name=excluded.league_name,position=excluded.position,price_eur=excluded.price_eur,enabled=true;`);
}
const block = `-- GENERATED_PLAYER_ROWS_START\n${statements.join("\n\n")}\n-- GENERATED_PLAYER_ROWS_END`;
let sql = await fs.readFile(migrationUrl, "utf8");
if (sql.includes("-- GENERATED_PLAYER_ROWS_START")) sql = sql.replace(/-- GENERATED_PLAYER_ROWS_START[\s\S]*?-- GENERATED_PLAYER_ROWS_END/, block);
else sql = sql.replace("-- GENERATED_PLAYER_ROWS", block);
await fs.writeFile(migrationUrl, sql, "utf8");
console.log(`Embedded ${players.length} verified-price players.`);
