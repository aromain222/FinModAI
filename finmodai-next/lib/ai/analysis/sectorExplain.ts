import type { SectorScore } from "@/lib/market/sectorMomentum";

type Explainer = {
  summary: string;
  drivers: { label: string; evidence: string[] }[];
  drags: { label: string; evidence: string[] }[];
  whatToWatch: string[];
};

const fallbackEvidence = ["No evidence captured yet"];

export function explainSectorMomentum(sector: SectorScore): Explainer {
  const directionText =
    sector.direction === "up"
      ? "trending up"
      : sector.direction === "down"
      ? "trending down"
      : "flat / mixed";

  const summary = `${sector.sector} is ${directionText} with score ${sector.score}. ${sector.summary}`;

  const drivers = (sector.drivers ?? []).map((d) => ({
    label: `${d.label} (impact ${d.impact?.toFixed?.(2) ?? "n/a"})`,
    evidence: d.evidence?.length ? d.evidence : fallbackEvidence,
  }));

  const drags = (sector.drags ?? []).map((d) => ({
    label: `${d.label} (impact ${d.impact?.toFixed?.(2) ?? "n/a"})`,
    evidence: d.evidence?.length ? d.evidence : fallbackEvidence,
  }));

  const topContributors = (sector.constituents ?? [])
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((c) => `${c.symbol} ${c.movePct?.toFixed?.(2) ?? "0"}% vol shock ${c.volumeShock?.toFixed?.(2) ?? "0"}`);

  const laggards = (sector.constituents ?? [])
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((c) => `${c.symbol} ${c.movePct?.toFixed?.(2) ?? "0"}% vol shock ${c.volumeShock?.toFixed?.(2) ?? "0"}`);

  const whatToWatch: string[] = [];
  if (topContributors.length) {
    whatToWatch.push(`Leaders: ${topContributors.join("; ")}`);
  }
  if (laggards.length) {
    whatToWatch.push(`Laggards: ${laggards.join("; ")}`);
  }
  if (!whatToWatch.length) {
    whatToWatch.push("No high-signal events detected; monitor for fresh flow signals.");
  }

  return {
    summary,
    drivers: drivers.length ? drivers : [{ label: "No drivers", evidence: fallbackEvidence }],
    drags: drags.length ? drags : [{ label: "No drags", evidence: fallbackEvidence }],
    whatToWatch,
  };
}
