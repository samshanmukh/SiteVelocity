import type { AppData, SnapshotView } from "../lib/view/app-data";
import type { CandidateSite } from "../lib/domain/site";
import type { EvidenceLevel } from "../lib/domain/schemas/core";

export type { AppData, SnapshotView };
export type { CandidateSite };

export type ModuleId =
  | "command" | "scout" | "map" | "sites" | "runs" | "next" | "dossier"
  | "devevents" | "watchlists" | "datasources" | "info"
  | "agentsettings" | "integrations" | "team";

export type PaneMode =
  | "overview" | "evidence" | "history" | "agents" | "nextstep" | "score" | "scout";

export interface UiState {
  module: ModuleId;
  infoId: string | null;
  siteId: string | null;
  dossierTab: string;
  pane: boolean;
  paneMode: PaneMode;
  paneWidth: "narrow" | "medium" | "wide";
  prevMode: PaneMode;
  evidenceId: string | null;
  scoreSel: "strategyFit" | "developmentReadiness" | "evidenceConfidence";
  searchQuery: string;
  scoutThread: ScoutMessage[];
}

export interface ScoutMessage {
  q: string;
  kind: "TOOL-GENERATED RESULT" | "AI EXPLANATION";
  tool?: string;
  title: string;
  body: string;
  next?: string;
  actions: { label: string; mode: PaneMode; evidenceId?: string }[];
}

export const EVIDENCE_BADGES: Record<EvidenceLevel, { label: string; bg: string; color: string }> = {
  document_verified: { label: "Document Verified", bg: "#E9F4EC", color: "#167339" },
  gis_screened: { label: "GIS Screened", bg: "#EAF0FC", color: "#2557C7" },
  ai_researched: { label: "AI Researched", bg: "#FAF3DF", color: "#8F6400" },
  professional_verification_required: { label: "Verification Required", bg: "#FBECED", color: "#B22730" },
};

export function siteStatus(site: CandidateSite, snapshot: SnapshotView | undefined): { label: string; bg: string; color: string; edge: string } {
  if (snapshot?.snapshot.status === "complete") return { label: "INVESTIGATED", bg: "#E9F4EC", color: "#167339", edge: "#1F9D55" };
  if (snapshot) return { label: "INVESTIGATED*", bg: "#FAF3DF", color: "#8F6400", edge: "#D9A62E" };
  return { label: "CANDIDATE", bg: "#EAF0FC", color: "#2557C7", edge: "#2557C7" };
}

export function barColor(value: number): string {
  return value >= 85 ? "#1F9D55" : value >= 70 ? "#2557C7" : "#D9A62E";
}

export function agentLabel(agent: string): string {
  const labels: Record<string, string> = {
    scout: "Opportunity Scout",
    land_use: "Land Use",
    development_history: "Development History",
    site_risk: "Site Risk",
    verifier: "Verifier",
    next_best_action: "Next Best Action",
  };
  return labels[agent] ?? agent;
}

export function runStatusColor(status: string): { dot: string; text: string; anim: boolean } {
  if (status === "complete") return { dot: "#1F9D55", text: "#167339", anim: false };
  if (status === "running") return { dot: "#2557C7", text: "#2557C7", anim: true };
  if (status === "failed") return { dot: "#B22730", text: "#B22730", anim: false };
  return { dot: "#C9CED6", text: "#8A929E", anim: false };
}

export interface NavItem {
  id: string;
  icon: string;
  label: string;
  status: "live" | "preview" | "roadmap";
  desc?: string;
  bullets?: string[];
  target?: { module: ModuleId; tab?: string };
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Primary",
    items: [
      { id: "command", icon: "▦", label: "Command Center", status: "live", target: { module: "command" } },
      { id: "scout", icon: "⌖", label: "Scout Opportunities", status: "live", target: { module: "scout" } },
      { id: "map", icon: "◈", label: "Opportunity Map", status: "live", target: { module: "map" } },
      { id: "sites", icon: "▤", label: "Sites", status: "live", target: { module: "sites" } },
      { id: "runs", icon: "◷", label: "Research Runs", status: "live", target: { module: "runs" } },
      { id: "next", icon: "➔", label: "Next Steps", status: "live", target: { module: "next" } },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { id: "devevents", icon: "◉", label: "Development Events", status: "live", target: { module: "devevents" } },
      { id: "watchlists", icon: "☆", label: "Watchlists", status: "live", target: { module: "watchlists" } },
      { id: "devhistory", icon: "≣", label: "Development History", status: "live", target: { module: "dossier", tab: "history" } },
      { id: "contactsmod", icon: "◎", label: "Contacts", status: "live", target: { module: "dossier", tab: "contacts" } },
    ],
  },
  {
    label: "Property Analysis",
    items: [
      { id: "land", icon: "▱", label: "Land & Parcel", status: "live", target: { module: "dossier", tab: "land" } },
      { id: "landuse", icon: "▨", label: "Land Use", status: "live", target: { module: "dossier", tab: "landuse" } },
      { id: "entitlements", icon: "✓", label: "Entitlements & Permits", status: "live", target: { module: "dossier", tab: "entitlements" } },
      { id: "siteenv", icon: "≈", label: "Site & Environment", status: "live", target: { module: "dossier", tab: "siterisk" } },
      { id: "utilities", icon: "⌁", label: "Utilities & Infrastructure", status: "live", target: { module: "dossier", tab: "utilities" } },
      { id: "title", icon: "§", label: "Title & Liens", status: "live", target: { module: "dossier", tab: "title" } },
      { id: "ownership", icon: "◫", label: "Ownership & Capital", status: "live", target: { module: "dossier", tab: "ownership" } },
      { id: "airrights", icon: "↟", label: "Air & Vertical Rights", status: "live", target: { module: "dossier", tab: "airrights" } },
    ],
  },
  {
    label: "Feasibility",
    items: [
      { id: "envelope", icon: "⬒", label: "Buildable Envelope", status: "live", target: { module: "dossier", tab: "envelope" } },
      { id: "yield", icon: "∑", label: "Development Yield", status: "live", target: { module: "dossier", tab: "yield" } },
      { id: "underwriting", icon: "ƒ", label: "Underwriting", status: "live", target: { module: "dossier", tab: "underwriting" } },
      { id: "ic", icon: "◧", label: "Investment Committee", status: "live", target: { module: "dossier", tab: "ic" } },
    ],
  },
  {
    label: "Administration",
    items: [
      { id: "datasources", icon: "⊞", label: "Data Sources", status: "live", target: { module: "datasources" } },
      { id: "agentsettings", icon: "✦", label: "Agent Settings", status: "live", target: { module: "agentsettings" } },
      { id: "integrations", icon: "⇄", label: "Integrations", status: "live", target: { module: "integrations" } },
      { id: "team", icon: "◳", label: "Team", status: "live", target: { module: "team" } },
    ],
  },
];
