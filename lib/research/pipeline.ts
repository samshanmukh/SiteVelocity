import { queryArcgis } from "../adapters/sources/arcgis";
import { FEMA_NFHL, SAN_JOSE_GENERAL_PLAN, SAN_JOSE_ZONING } from "../adapters/sources/registry";
import type { AgentRun, Evidence, Finding, NextAction, ResearchSnapshot } from "../domain/schemas/core";
import type { CandidateSite } from "../domain/site";
import { runCalculation, type CalculationRun } from "../calculations/registry";
import {
  developmentReadiness,
  evidenceConfidence,
  type ScoreOutput,
} from "../calculations/scoring/alpha-scores";
import { saveSnapshotBundle, type SnapshotBundle } from "../persistence/runtime-store";
import {
  researchDevelopmentHistoryLive,
  researchPropertyIntelligenceLive,
  liveResearchConfigured,
} from "./live-history";
import { DEFAULT_WORKSPACE_AGENT_SETTINGS, type WorkspaceAgentSettings } from "../domain/workspace-settings";

/**
 * Site research pipeline (docs/SYSTEM_DESIGN.md §11).
 * Deterministic agents query authoritative public GIS sources directly.
 * The Development History agent uses live providers (Rtrvr + MiniMax) when
 * configured; otherwise it reports queued and the snapshot is honestly
 * partial. "Not found" never becomes "does not exist".
 */

export interface TimelineEvent {
  year: string;
  title: string;
  description: string;
  dotColor: string;
  evidenceId: string | null;
}

interface AgentContext {
  site: CandidateSite;
  now: string;
  evidence: Evidence[];
  findings: Finding[];
  timeline: TimelineEvent[];
  runs: AgentRun[];
}

let idCounter = 0;
function nextId(prefix: string, siteId: string): string {
  idCounter += 1;
  return `${prefix}-${siteId}-${idCounter.toString(36)}`;
}

function finishRun(run: AgentRun, status: AgentRun["status"], summary: string, sources: number, now: string): AgentRun {
  return { ...run, status, summary, sourcesUsed: sources, finishedAt: now };
}

async function runLandUse(ctx: AgentContext): Promise<AgentRun> {
  const { site, now } = ctx;
  const run: AgentRun = { id: nextId("run-landuse", site.id), siteId: site.id, agent: "land_use", status: "running", startedAt: now, sourcesUsed: 0 };
  if (!site.coordinates) {
    return finishRun(run, "failed", "No parcel coordinates available for GIS queries.", 0, now);
  }
  const point = { x: site.coordinates.longitude, y: site.coordinates.latitude };

  const zoningFeatures = await queryArcgis(SAN_JOSE_ZONING.layerUrl, { geometry: point, outFields: "ZONING,ZONINGABBREV,PDUSE,PDDENSITY,REZONINGFILE,APPROVALDATE" });
  const zoning = zoningFeatures[0]?.attributes as Record<string, unknown> | undefined;
  let sources = 0;
  if (zoning) {
    sources += 1;
    const evidenceId = nextId("ev-zoning", site.id);
    ctx.evidence.push({
      id: evidenceId,
      source: { agency: SAN_JOSE_ZONING.agency, dataset: SAN_JOSE_ZONING.dataset, sourceRecordId: String(zoning.ZONINGABBREV ?? "zoning"), sourceUrl: `${SAN_JOSE_ZONING.layerUrl}/query`, retrievedAt: now },
      title: `Zoning district at parcel centroid — ${String(zoning.ZONINGABBREV ?? "unknown")}`,
      excerpt: `Official zoning layer: district ${String(zoning.ZONING ?? "—")}${zoning.PDUSE ? `, PD use ${String(zoning.PDUSE)}` : ""}${zoning.REZONINGFILE ? `, rezoning file ${String(zoning.REZONINGFILE)}` : ""}.`,
      payload: zoning,
    });
    ctx.findings.push({
      id: nextId("f-zoning", site.id), siteId: site.id, category: "land_use", field: "zoning_district",
      valueJson: zoning.ZONINGABBREV ?? null, status: "verified", evidenceLevel: "gis_screened",
      confidence: 0.9, impact: "opportunity", evidenceIds: [evidenceId],
      note: "District mapped by the official City zoning layer. Zone name alone does not establish permitted use.",
      createdAt: now,
    });
    ctx.findings.push({
      id: nextId("f-permuse", site.id), siteId: site.id, category: "land_use", field: "residential_permitted_use",
      valueJson: null, status: "unknown", evidenceLevel: "professional_verification_required",
      confidence: 0.3, impact: "unknown", evidenceIds: [evidenceId],
      note: "Permitted residential use and density must be confirmed against the municipal code and any PD overlay — not inferred from the zone abbreviation.",
      createdAt: now,
    });
    ctx.findings.push({
      id: nextId("f-airrights", site.id), siteId: site.id, category: "air_rights", field: "vertical_development_rights",
      valueJson: null, status: "unknown", evidenceLevel: "professional_verification_required",
      confidence: 0.25, impact: "unknown", evidenceIds: [evidenceId],
      note: "The mapped zoning district does not establish transferable development rights, unused air rights, rooftop rights, FAA clearance, or a legal height envelope. Confirm the controlling code, overlays, recorded agreements, and aviation constraints.",
      createdAt: now,
    });
    if (zoning.REZONINGFILE && zoning.APPROVALDATE) {
      const approval = new Date(Number(zoning.APPROVALDATE));
      if (!Number.isNaN(approval.getTime())) {
        ctx.timeline.push({
          year: String(approval.getUTCFullYear()),
          title: "Rezoning approved",
          description: `Rezoning file ${String(zoning.REZONINGFILE)} approved ${approval.toISOString().slice(0, 10)} (official zoning layer).`,
          dotColor: "#2557C7",
          evidenceId: ctx.evidence[ctx.evidence.length - 1]?.id ?? null,
        });
      }
    }
  }

  const gpFeatures = await queryArcgis(SAN_JOSE_GENERAL_PLAN.layerUrl, { geometry: point, outFields: "GPDESIGNATION,GPABBREVIATION" });
  const gp = gpFeatures[0]?.attributes as Record<string, unknown> | undefined;
  if (gp?.GPDESIGNATION) {
    sources += 1;
    const evidenceId = nextId("ev-gp", site.id);
    ctx.evidence.push({
      id: evidenceId,
      source: { agency: SAN_JOSE_GENERAL_PLAN.agency, dataset: SAN_JOSE_GENERAL_PLAN.dataset, sourceRecordId: String(gp.GPABBREVIATION ?? "gp"), sourceUrl: `${SAN_JOSE_GENERAL_PLAN.layerUrl}/query`, retrievedAt: now },
      title: `General Plan 2040 designation — ${String(gp.GPDESIGNATION)}`,
      excerpt: `Envision San José 2040 land-use designation at the parcel centroid: ${String(gp.GPDESIGNATION)}.`,
      payload: gp,
    });
    ctx.findings.push({
      id: nextId("f-gp", site.id), siteId: site.id, category: "land_use", field: "general_plan_designation",
      valueJson: gp.GPDESIGNATION, status: "verified", evidenceLevel: "gis_screened",
      confidence: 0.9, impact: "opportunity", evidenceIds: [evidenceId],
      createdAt: now,
    });
  }

  return finishRun(run, sources > 0 ? "complete" : "failed",
    sources > 0 ? `Zoning and General Plan designations mapped from official City GIS (${sources} layers).` : "City GIS layers returned no features at the parcel centroid.",
    sources, now);
}

async function runSiteRisk(ctx: AgentContext): Promise<AgentRun> {
  const { site, now } = ctx;
  const run: AgentRun = { id: nextId("run-risk", site.id), siteId: site.id, agent: "site_risk", status: "running", startedAt: now, sourcesUsed: 0 };
  let sources = 0;

  if (site.coordinates) {
    const flood = await queryArcgis(FEMA_NFHL.layerUrl, {
      geometry: { x: site.coordinates.longitude, y: site.coordinates.latitude },
      outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
    });
    const zone = flood[0]?.attributes as Record<string, unknown> | undefined;
    if (zone) {
      sources += 1;
      const evidenceId = nextId("ev-fema", site.id);
      const inSfha = zone.SFHA_TF === "T";
      ctx.evidence.push({
        id: evidenceId,
        source: { agency: FEMA_NFHL.agency, dataset: FEMA_NFHL.dataset, sourceRecordId: String(zone.FLD_ZONE ?? "zone"), sourceUrl: `${FEMA_NFHL.layerUrl}/query`, retrievedAt: now },
        title: `FEMA flood zone ${String(zone.FLD_ZONE ?? "—")}`,
        excerpt: `NFHL: zone ${String(zone.FLD_ZONE ?? "—")}${zone.ZONE_SUBTY ? ` (${String(zone.ZONE_SUBTY)})` : ""}; special flood hazard area: ${inSfha ? "yes" : "no"}.`,
        payload: zone,
      });
      ctx.findings.push({
        id: nextId("f-flood", site.id), siteId: site.id, category: "site_risk", field: "fema_flood_zone",
        valueJson: zone.FLD_ZONE ?? null, status: "verified", evidenceLevel: "gis_screened",
        confidence: 0.9, impact: inSfha ? "cost_timing_risk" : "opportunity", evidenceIds: [evidenceId],
        note: inSfha ? "Parcel centroid intersects a special flood hazard area — elevation/insurance implications need engineering review." : "Centroid screen only; a flood screen is not an engineering or insurance determination.",
        createdAt: now,
      });
    }
  }

  const abEvidence = site.evidence.find((e) => e.source.dataset.startsWith("AB2011"));
  const screens = site.cityScreens;
  if (abEvidence && Object.keys(screens).length > 0) {
    sources += 1;
    const flagged = Object.entries(screens).filter(([k, v]) => !["VACANT", "URBANVILLA"].includes(k) && v !== "NO");
    ctx.findings.push({
      id: nextId("f-screens", site.id), siteId: site.id, category: "site_risk", field: "city_constraint_screens",
      valueJson: screens, status: flagged.length === 0 ? "probable" : "conflicting",
      evidenceLevel: "gis_screened", confidence: 0.7,
      impact: flagged.length === 0 ? "opportunity" : "cost_timing_risk", evidenceIds: [abEvidence.id],
      note: flagged.length === 0
        ? "City AB 2011 screening (Apr 2024) reports no wetland, historic, habitat, farmland, or waste-site conflicts. A public screen is not environmental clearance."
        : `City screening flags: ${flagged.map(([k, v]) => `${k}=${v}`).join(", ")}. Screen results require professional confirmation.`,
      createdAt: now,
    });
  }

  return finishRun(run, sources > 0 ? "complete" : "failed",
    sources > 0 ? `Flood and public constraint screens completed from ${sources} authoritative source(s).` : "No risk sources reachable.",
    sources, now);
}

async function runDevelopmentHistory(ctx: AgentContext, maxExternalTasks = 2): Promise<AgentRun> {
  const { site, now } = ctx;
  const run: AgentRun = { id: nextId("run-history", site.id), siteId: site.id, agent: "development_history", status: "running", startedAt: now, sourcesUsed: 0 };

  if (!liveResearchConfigured()) {
    ctx.findings.push({
      id: nextId("f-history", site.id), siteId: site.id, category: "development_history", field: "planning_and_permit_history",
      valueJson: null, status: "unknown", evidenceLevel: "professional_verification_required",
      confidence: 0.2, impact: "unknown", evidenceIds: [],
      note: "Planning-case and permit history has not been researched yet. Absence of a located record is never proof that no record exists.",
      createdAt: now,
    });
    addUnavailablePropertyIntelligence(ctx, "Live public-records research has not run. Configure Rtrvr and MiniMax, then refresh the site.");
    return finishRun(run, "queued", "Awaiting live research providers (Rtrvr + MiniMax keys not configured on this machine).", 0, now);
  }

  if (maxExternalTasks < 2) {
    try {
      const result = await researchDevelopmentHistoryLive(site, now);
      ctx.evidence.push(...result.evidence);
      ctx.findings.push(...result.findings);
      ctx.timeline.push(...result.timeline);
      addUnavailablePropertyIntelligence(ctx, "Workspace policy limited this run to development-history research; full property intelligence was not executed.");
      return finishRun(run, "complete", `${result.summary} Property-intelligence task skipped by workspace policy.`, result.evidence.length, now);
    } catch {
      addUnavailablePropertyIntelligence(ctx, "The allowed live public-records task failed; these facts remain unknown.");
      return finishRun(run, "failed", "Development-history retrieval failed; facts remain unknown.", 0, now);
    }
  }

  const [historyResult, propertyResult] = await Promise.allSettled([
    researchDevelopmentHistoryLive(site, now),
    researchPropertyIntelligenceLive(site, now),
  ]);
  let sources = 0;
  const summaries: string[] = [];
  if (historyResult.status === "fulfilled") {
    ctx.evidence.push(...historyResult.value.evidence);
    ctx.findings.push(...historyResult.value.findings);
    ctx.timeline.push(...historyResult.value.timeline);
    sources += historyResult.value.evidence.length;
    summaries.push(historyResult.value.summary);
  } else {
    ctx.findings.push({
      id: nextId("f-history", site.id), siteId: site.id, category: "development_history", field: "planning_and_permit_history",
      valueJson: null, status: "unknown", evidenceLevel: "professional_verification_required",
      confidence: 0.2, impact: "unknown", evidenceIds: [],
      note: "Live research attempt failed; history remains unknown. The failure is recorded and does not overwrite prior valid research.",
      createdAt: now,
    });
    summaries.push("Development-history retrieval failed; history remains unknown.");
  }
  if (propertyResult.status === "fulfilled") {
    ctx.evidence.push(...propertyResult.value.evidence);
    ctx.findings.push(...propertyResult.value.findings);
    sources += propertyResult.value.evidence.length;
    summaries.push(propertyResult.value.summary);
  } else {
    addUnavailablePropertyIntelligence(ctx, "Live public-records retrieval failed; the previous accepted snapshot remains available and these facts remain unknown.");
    summaries.push("Property-intelligence retrieval failed; contacts, utilities, ownership, and title remain unknown.");
  }

  const complete = historyResult.status === "fulfilled" && propertyResult.status === "fulfilled";
  return finishRun(run, complete ? "complete" : "failed", summaries.join(" "), sources, now);
}

function addUnavailablePropertyIntelligence(ctx: AgentContext, reason: string): void {
  const fields = [
    ["contacts", "public_professional_contact", "unknown"],
    ["utilities", "parcel_utility_capacity", "cost_timing_risk"],
    ["ownership", "record_owner", "unknown"],
    ["title", "liens_easements_and_encumbrances", "cost_timing_risk"],
  ] as const;
  for (const [category, field, impact] of fields) {
    ctx.findings.push({
      id: nextId(`f-${category}`, ctx.site.id),
      siteId: ctx.site.id,
      category,
      field,
      valueJson: null,
      status: "unknown",
      evidenceLevel: "professional_verification_required",
      confidence: 0.2,
      impact,
      evidenceIds: [],
      note: reason,
      createdAt: ctx.now,
    });
  }
}

function runVerifier(ctx: AgentContext, depth: WorkspaceAgentSettings["verificationDepth"]): AgentRun {
  const { site, now } = ctx;
  const run: AgentRun = { id: nextId("run-verify", site.id), siteId: site.id, agent: "verifier", status: "running", startedAt: now, sourcesUsed: 0 };
  let checked = 0;
  let downgraded = 0;

  for (const finding of ctx.findings) {
    const isHighImpact = depth === "screening"
      ? finding.impact === "fatal_constraint"
      : depth === "enhanced"
        ? finding.status !== "unknown"
        : finding.impact === "fatal_constraint" || (finding.status === "verified" && finding.confidence >= 0.85);
    if (!isHighImpact) continue;
    checked += 1;
    const hasAuthoritativeEvidence = finding.evidenceIds.some((id) => {
      const evidence = [...ctx.evidence, ...site.evidence].find((e) => e.id === id);
      return evidence !== undefined;
    });
    if (!hasAuthoritativeEvidence) {
      finding.status = "probable";
      finding.confidence = Math.min(finding.confidence, 0.6);
      finding.note = `${finding.note ? `${finding.note} ` : ""}[Verifier] Downgraded: no linked authoritative evidence.`;
      downgraded += 1;
    }
  }

  return finishRun(run, "complete",
    `Checked ${checked} high-impact claim(s); downgraded ${downgraded}. Unknowns and conflicts preserved, not resolved.`,
    0, now);
}

function recommendNextAction(ctx: AgentContext): { run: AgentRun; action: NextAction | null } {
  const { site, now } = ctx;
  const run: AgentRun = { id: nextId("run-nba", site.id), siteId: site.id, agent: "next_best_action", status: "running", startedAt: now, sourcesUsed: 0 };

  const weight = (f: Finding) => (f.impact === "fatal_constraint" ? 3 : f.impact === "cost_timing_risk" ? 2 : 1);
  const unresolved = ctx.findings
    .filter((f) => f.status === "unknown" || f.status === "conflicting")
    .sort((a, b) => weight(b) - weight(a));
  const top = unresolved[0];
  if (!top) {
    return { run: finishRun(run, "complete", "No unresolved material findings to act on.", 0, now), action: null };
  }

  const templates: Record<string, Omit<NextAction, "id" | "siteId" | "sourceFindingIds">> = {
    residential_permitted_use: {
      title: "Confirm permitted residential use and density with Current Planning",
      why: "The zoning district is mapped, but permitted use and density come from the municipal code and any PD overlay — this is the highest-impact unknown for the thesis.",
      role: "City of San José — Planning Division (Current Planning counter)",
      knownFacts: [
        `APN ${site.apnFormatted}${site.address ? ` — ${site.address}` : ""}`,
        `Zoning district (official GIS): ${site.zoningAbbr ?? "see finding"}`,
        `Parcel ~${site.acresDerived?.value ?? "?"} ac (GIS-derived)`,
        "Listed in the City's April 2024 AB 2011 screening",
      ],
      questions: [
        "Is multifamily or mixed-use residential permitted by right, conditionally, or via AB 2011 / SB 6 streamlining on this parcel?",
        "What density, height, and FAR apply, and does any PD overlay or urban village plan control?",
        "Are there active or expired entitlements on this APN?",
      ],
      documents: ["Zoning verification letter request form", "Any PD overlay ordinance and conditions", "Urban village plan excerpt if applicable"],
      expectedFollowUp: "Written confirmation of permitted use/density, or identification of the controlling overlay documents.",
    },
    planning_and_permit_history: {
      title: "Pull planning-case and permit history for the APN",
      why: "Prior applications, approvals, or stalled permits materially change readiness and deal strategy, and none have been researched yet.",
      role: "City of San José — Permit Center records / SJPermits portal",
      knownFacts: [
        `APN ${site.apnFormatted}${site.address ? ` — ${site.address}` : ""}`,
        "City AB 2011 screening lists the parcel as vacant (Apr 2024)",
      ],
      questions: [
        "Are there planning applications or entitlements recorded against this APN?",
        "Any building, grading, or demolition permits — active, expired, or withdrawn?",
        "Any code-enforcement cases affecting redevelopment?",
      ],
      documents: ["Permit history printout for the APN", "Staff reports for any planning cases located"],
      expectedFollowUp: "A documented development-history timeline with case numbers, or written confirmation that no records were located.",
    },
    city_constraint_screens: {
      title: "Verify flagged constraint screens with the responsible agencies",
      why: "A city screening flag is a signal, not a determination; the flagged item can be fatal or immaterial depending on the authoritative record.",
      role: "Screen-specific agency (e.g., USFWS/CDFW for habitat, SHPO for historic, Regional Water Board for waste sites)",
      knownFacts: [`City AB 2011 screening flags: ${JSON.stringify(site.cityScreens)}`],
      questions: ["What authoritative record underlies the flagged screen?", "What study or clearance would resolve it, at what cost and timeline?"],
      documents: ["Authoritative database extract for the flagged constraint"],
      expectedFollowUp: "Authoritative confirmation or clearance path for each flagged screen.",
    },
  };

  const template = templates[top.field] ?? templates.planning_and_permit_history;
  const action: NextAction = { id: nextId("nba", site.id), siteId: site.id, sourceFindingIds: [top.id], ...template };
  return {
    run: finishRun(run, "complete", `Selected highest-impact unresolved question: ${top.field.replace(/_/g, " ")}.`, 0, now),
    action,
  };
}

export async function researchSite(
  site: CandidateSite,
  options: { persist?: (bundle: SnapshotBundle) => Promise<void>; settings?: WorkspaceAgentSettings } = {},
): Promise<SnapshotBundle> {
  const now = new Date().toISOString();
  const ctx: AgentContext = { site, now, evidence: [], findings: [], timeline: [], runs: [] };
  const settings = options.settings ?? DEFAULT_WORKSPACE_AGENT_SETTINGS;
  const skipped = (agent: AgentRun["agent"], summary: string): AgentRun => ({
    id: nextId(`run-${agent}`, site.id), siteId: site.id, agent, status: "complete",
    startedAt: now, finishedAt: now, sourcesUsed: 0, summary,
  });

  // Scout already ran at ingestion; record it for the visible agent roster.
  ctx.runs.push({
    id: nextId("run-scout", site.id), siteId: site.id, agent: "scout", status: "complete",
    startedAt: now, finishedAt: now, sourcesUsed: site.evidence.length,
    summary: `Ranked #${site.rank} for the thesis: ${site.scoutReasons.slice(0, 3).join("; ")}.`,
  });

  const [landUse, siteRisk] = await Promise.all([
    settings.enabledAgents.land_use ? runLandUse(ctx) : skipped("land_use", "Disabled by workspace policy."),
    settings.enabledAgents.site_risk ? runSiteRisk(ctx) : skipped("site_risk", "Disabled by workspace policy."),
  ]);
  ctx.runs.push(landUse, siteRisk);
  if (settings.enabledAgents.development_history && settings.maxExternalResearchTasksPerSite > 0 && settings.verificationDepth !== "screening") {
    ctx.runs.push(await runDevelopmentHistory(ctx, settings.maxExternalResearchTasksPerSite));
  } else {
    addUnavailablePropertyIntelligence(ctx, "Live public-records research was skipped by workspace policy; these facts remain unknown.");
    ctx.findings.push({ id: nextId("f-history", site.id), siteId: site.id, category: "development_history", field: "planning_and_permit_history", valueJson: null, status: "unknown", evidenceLevel: "professional_verification_required", confidence: 0.2, impact: "unknown", evidenceIds: [], note: "Development-history research was skipped by workspace policy.", createdAt: now });
    ctx.runs.push(skipped("development_history", "Disabled or limited by workspace policy."));
  }
  ctx.runs.push(settings.enabledAgents.verifier ? runVerifier(ctx, settings.verificationDepth) : skipped("verifier", "Disabled by workspace policy."));
  const { run: nbaRun, action } = settings.enabledAgents.next_best_action
    ? recommendNextAction(ctx)
    : { run: skipped("next_best_action", "Disabled by workspace policy."), action: null };
  ctx.runs.push(nbaRun);

  const readiness: CalculationRun<ScoreOutput> = runCalculation(developmentReadiness, {
    zoningStatus: ctx.findings.some((f) => f.field === "zoning_district" && f.status === "verified") ? "unclear" : "unknown",
    priorApproval: "unknown",
    permitActivity: "unknown",
    housingElementSite: null,
  }, () => now);

  const confidence: CalculationRun<ScoreOutput> = runCalculation(evidenceConfidence, {
    documentVerified: 0,
    gisScreened: ctx.findings.filter((f) => f.evidenceLevel === "gis_screened").length,
    aiResearched: ctx.findings.filter((f) => f.evidenceLevel === "ai_researched").length,
    verificationRequired: ctx.findings.filter((f) => f.evidenceLevel === "professional_verification_required").length,
    conflictingFindings: ctx.findings.filter((f) => f.status === "conflicting").length,
    materialUnknowns: ctx.findings.filter((f) => f.status === "unknown").length,
  }, () => now);

  const failed = ctx.runs.some((r) => r.status === "failed");
  const incomplete = ctx.runs.some((r) => r.status !== "complete");
  const snapshot: ResearchSnapshot = {
    id: `snap-${now.replace(/[:.]/g, "-")}`,
    siteId: site.id,
    status: failed || incomplete ? "partial" : "complete",
    createdAt: now,
    sourceCutoff: now,
    evidenceIds: ctx.evidence.map((e) => e.id),
    findingIds: ctx.findings.map((f) => f.id),
    agentRunIds: ctx.runs.map((r) => r.id),
    schemaVersion: "1",
  };

  const bundle: SnapshotBundle = {
    snapshot,
    evidence: ctx.evidence,
    findings: ctx.findings,
    agentRuns: ctx.runs,
    scores: {
      strategyFit: site.strategyFit,
      developmentReadiness: readiness,
      evidenceConfidence: confidence,
    },
    nextAction: action,
    timeline: ctx.timeline,
  };
  await (options.persist ?? saveSnapshotBundle)(bundle);
  return bundle;
}
