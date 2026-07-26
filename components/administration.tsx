"use client";

import { useEffect, useState } from "react";
import type { AppData, ModuleId } from "./model";
import type { WorkspaceAgentSettings } from "@/lib/domain/workspace-settings";
import type { ScoutPreference, ScoutPreferenceCategory } from "@/lib/domain/scout-preference";

type AdminMode = Extract<ModuleId, "agentsettings" | "integrations" | "team">;
type TeamMember = { userId: string; email: string; role: "owner" | "admin" | "member" | "viewer"; current: boolean };

export function Administration({ mode, data }: { mode: AdminMode; data: AppData }) {
  if (mode === "agentsettings") return <AgentSettings initial={data.agentSettings} canEdit={data.session?.role === "owner" || data.session?.role === "admin" || data.runtime.demoMode} />;
  if (mode === "integrations") return <Integrations data={data} />;
  return <Team canEdit={data.session?.role === "owner" && !data.runtime.demoMode} />;
}

function AgentSettings({ initial, canEdit }: { initial: WorkspaceAgentSettings; canEdit: boolean }) {
  const [settings, setSettings] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const save = async () => {
    setState("saving");
    const response = await fetch("/api/settings/agents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabledAgents: settings.enabledAgents,
        verificationDepth: settings.verificationDepth,
        maxExternalResearchTasksPerSite: settings.maxExternalResearchTasksPerSite,
      }),
    });
    if (!response.ok) return setState("error");
    setSettings(await response.json() as WorkspaceAgentSettings);
    setState("saved");
  };
  return (
    <div style={{ maxWidth: 860 }}>
      <h1 className="sv-h1">Agent Settings</h1>
      <p className="sv-sub">Tenant-scoped policy used by every new site-research workflow.</p>
      <section className="sv-panel sv-panel-pad" style={{ marginTop: 14 }}>
        <div className="sv-section-label">Specialist agents</div>
        {Object.entries(settings.enabledAgents).map(([key, enabled]) => (
          <label className="sv-row" key={key} style={{ cursor: canEdit ? "pointer" : "default" }}>
            <span style={{ flex: 1, fontWeight: 600 }}>{key.replace(/_/g, " ")}</span>
            <input type="checkbox" checked={enabled} disabled={!canEdit} onChange={(event) => setSettings((current) => ({ ...current, enabledAgents: { ...current.enabledAgents, [key]: event.target.checked } }))} />
          </label>
        ))}
        <div className="sv-grid2" style={{ marginTop: 14 }}>
          <label><span className="sv-section-label">Verification depth</span><select disabled={!canEdit} value={settings.verificationDepth} onChange={(event) => setSettings({ ...settings, verificationDepth: event.target.value as WorkspaceAgentSettings["verificationDepth"] })}><option value="screening">Screening</option><option value="standard">Standard</option><option value="enhanced">Enhanced</option></select></label>
          <label><span className="sv-section-label">External research tasks / site</span><select disabled={!canEdit} value={settings.maxExternalResearchTasksPerSite} onChange={(event) => setSettings({ ...settings, maxExternalResearchTasksPerSite: Number(event.target.value) })}><option value={0}>0 — GIS only</option><option value={1}>1 — history</option><option value={2}>2 — full public records</option></select></label>
        </div>
        <button className="sv-btn" style={{ marginTop: 14 }} disabled={!canEdit || state === "saving"} onClick={() => void save()}>{state === "saving" ? "SAVING…" : "SAVE POLICY"}</button>
        <span className="sv-note" style={{ marginLeft: 10 }}>{state === "saved" ? "Saved; applies to the next workflow." : state === "error" ? "Save failed." : settings.updatedAt ? `Updated ${new Date(settings.updatedAt).toLocaleString()}` : "Using defaults."}</span>
      </section>
      <ScoutPreferences />
    </div>
  );
}

function ScoutPreferences() {
  const [preferences, setPreferences] = useState<ScoutPreference[]>([]);
  const [category, setCategory] = useState<ScoutPreferenceCategory>("investment_criteria");
  const [content, setContent] = useState("");
  const [state, setState] = useState<"loading" | "idle" | "saving" | "error">("loading");
  const [mem0Enabled, setMem0Enabled] = useState(false);
  useEffect(() => {
    void fetch("/api/scout/preferences", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = await response.json() as { preferences: ScoutPreference[]; mem0Enabled: boolean };
        setPreferences(payload.preferences);
        setMem0Enabled(payload.mem0Enabled);
        setState("idle");
      })
      .catch(() => setState("error"));
  }, []);
  const save = async () => {
    if (content.trim().length < 3) return;
    setState("saving");
    const response = await fetch("/api/scout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, content: content.trim() }),
    });
    if (!response.ok) return setState("error");
    const payload = await response.json() as { preference: ScoutPreference; mem0Synced: boolean };
    setPreferences((current) => [payload.preference, ...current].slice(0, 50));
    setMem0Enabled((current) => current || payload.mem0Synced);
    setContent("");
    setState("idle");
  };
  return (
    <section className="sv-panel sv-panel-pad" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div><div className="sv-section-label">Scout memory</div><p className="sv-note">Durable advisory preferences only; never treated as property evidence.</p></div>
        <span className="sv-badge">{mem0Enabled ? "MEM0 + DATABASE" : "DATABASE"}</span>
      </div>
      <div className="sv-grid2" style={{ marginTop: 10 }}>
        <select aria-label="Preference category" value={category} onChange={(event) => setCategory(event.target.value as ScoutPreferenceCategory)}>
          <option value="investment_criteria">Investment criteria</option><option value="risk_tolerance">Risk tolerance</option><option value="communication">Communication</option><option value="workflow">Workflow</option>
        </select>
        <input className="sv-search" style={{ maxWidth: "none" }} value={content} maxLength={500} placeholder="e.g. Prefer sites above 100 units" onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); }} />
      </div>
      <button className="sv-btn" style={{ marginTop: 10 }} disabled={state === "saving" || content.trim().length < 3} onClick={() => void save()}>{state === "saving" ? "SAVING…" : "REMEMBER"}</button>
      {state === "error" ? <span className="sv-note" style={{ marginLeft: 10, color: "var(--red)" }}>Preference storage is unavailable.</span> : null}
      <div style={{ marginTop: 10 }}>{preferences.slice(0, 6).map((preference) => <div className="sv-row" key={preference.id}><span className="sv-badge">{preference.category.replace(/_/g, " ")}</span><span style={{ flex: 1 }}>{preference.content}</span></div>)}</div>
    </section>
  );
}

function Integrations({ data }: { data: AppData }) {
  const [providers, setProviders] = useState(data.providers);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    const response = await fetch("/api/integrations", { cache: "no-store" });
    if (response.ok) setProviders(((await response.json()) as { providers: AppData["providers"] }).providers);
    setBusy(false);
  };
  return (
    <div>
      <h1 className="sv-h1">Integrations</h1>
      <p className="sv-sub">Live health and configuration state. Credentials stay server-side and are never returned to this screen.</p>
      <button className="sv-btn" style={{ marginTop: 12 }} disabled={busy} onClick={() => void refresh()}>{busy ? "CHECKING…" : "REFRESH STATUS"}</button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10, marginTop: 14 }}>
        {providers.map((provider) => <section className="sv-panel sv-panel-pad" key={provider.id}><div style={{ display: "flex", justifyContent: "space-between" }}><strong>{provider.name}</strong><span className={`status status-${provider.status}`}>{provider.status}</span></div><p className="sv-note" style={{ marginTop: 7 }}>{provider.message}</p>{provider.latencyMs === undefined ? null : <span className="mono">{provider.latencyMs} ms</span>}</section>)}
      </div>
    </div>
  );
}

function Team({ canEdit }: { canEdit: boolean }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [issue, setIssue] = useState<string | null>(null);
  useEffect(() => { void fetch("/api/team", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); setMembers(await response.json() as TeamMember[]); }).catch(() => setIssue("Team membership could not be loaded.")); }, []);
  const updateRole = async (userId: string, role: TeamMember["role"]) => {
    const response = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role }) });
    if (!response.ok) return setIssue(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Role update failed.");
    setMembers((current) => current.map((member) => member.userId === userId ? { ...member, role } : member));
  };
  return (
    <div style={{ maxWidth: 860 }}><h1 className="sv-h1">Team</h1><p className="sv-sub">Supabase-authenticated organization memberships and enforced roles.</p><section className="sv-panel" style={{ marginTop: 14 }}>{members.map((member) => <div className="sv-row" key={member.userId}><div style={{ flex: 1 }}><strong>{member.email}</strong>{member.current ? <span className="sv-badge" style={{ marginLeft: 8 }}>YOU</span> : null}<div className="mono" style={{ fontSize: 10 }}>{member.userId}</div></div><select aria-label={`Role for ${member.email}`} disabled={!canEdit} value={member.role} onChange={(event) => void updateRole(member.userId, event.target.value as TeamMember["role"])}><option value="owner">Owner</option><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></select></div>)}{members.length === 0 && !issue ? <div className="sv-empty">Loading memberships…</div> : null}{issue ? <div className="sv-empty" style={{ color: "var(--red)" }}>{issue}</div> : null}</section></div>
  );
}
