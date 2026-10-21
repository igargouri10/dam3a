import Image from "next/image";
import type { Team } from "@/types";

export function TeamCrest({ team, size = 34 }: { team: Pick<Team, "name" | "shortName" | "color" | "logoUrl">; size?: number }) {
  return <span className={`crest ${team.logoUrl ? "crest-logo" : "crest-fallback"}`} style={{ width: size, height: size, backgroundColor: team.logoUrl ? undefined : team.color }}>
    {team.logoUrl ? <Image src={team.logoUrl} alt={`${team.name} logo`} fill sizes={`${size}px`} className="crest-image" /> : team.shortName}
  </span>;
}
