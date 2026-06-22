import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type D1Stmt = {
  bind: (...vals: unknown[]) => D1Stmt;
  first: <T = unknown>() => Promise<T | null>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
};
type D1 = { prepare: (sql: string) => D1Stmt };
type Env = { DB?: D1 };

type Project = {
  id: string;
  name: string;
  project_type: string;
  status: string;
  current_revision_id: string | null;
};

type Revision = {
  revision_number: number;
  design_intent: string;
};

type Assembly = {
  id: string;
  name: string;
  description: string | null;
};

type Feature = {
  id: string;
  feature_type: string;
  parameters_json: string;
  order_index: number;
};

type ShaftReportParams = {
  status: "sized";
  diameter: number;
  material: string;
  torque?: number;
  radialLoad?: number;
  bendingMoment?: number;
  checks?: {
    stress?: { passed?: boolean };
    deflection?: { passed?: boolean };
    criticalSpeed?: { passed?: boolean };
  };
  citations?: { check: string; doc: string; section: string; page: number | null }[];
};

type BearingParams = {
  status: "sized"; kind: "bearing";
  designation: string; series: string; bore_in: number;
  dynamicLoadRating_lbf: number; staticLoadRating_lbf: number;
  appliedRadialLoad_lbf: number; ratingLife_L10h: number;
  staticSafetyFactor: number | null; targetLifeHours: number;
  standard: string; reference: string; note?: string;
};

type DeclaredParams = {
  status: "declared";
  note?: string;
};

type FeatureParams = ShaftReportParams | BearingParams | DeclaredParams | null;

type BriefShape = {
  name?: string;
  power?: number;
  speed?: number;
  overhang?: number;
  bearingSpan?: number;
  material?: string;
  applicationFactor?: number;
  projectType?: string;
  head?: number;
  impellerDiameter?: number;
  impellerWidth?: number;
  specificGravity?: number;
  casingType?: string;
};

type DesignIntentShape = {
  brief?: BriefShape;
  diameter?: number;
  stressPassed?: boolean;
  deflectionPassed?: boolean;
  criticalSpeedPassed?: boolean;
  citations?: { check: string; doc: string; section: string; page: number | null }[];
};

function safeParse(s: string | null | undefined): FeatureParams {
  if (!s) return null;
  try {
    return JSON.parse(s) as FeatureParams;
  } catch {
    return null;
  }
}

function safeParseDesignIntent(s: string | null | undefined): DesignIntentShape | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as DesignIntentShape;
  } catch {
    return null;
  }
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function fmtDiameter(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(3);
}

function CheckChip({ label, passed }: { label: string; passed?: boolean }) {
  const color = passed === true ? "#2e7d32" : passed === false ? "#c0392b" : "#888";
  const text = passed === true ? "PASS" : passed === false ? "FAIL" : "—";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: "0.75rem",
        fontWeight: 600,
        color,
        background: passed === true ? "#e8f5e9" : passed === false ? "#fdecea" : "#f0f0f0",
        marginRight: 6,
      }}
    >
      {label}: {text}
    </span>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: "1.5rem 2rem",
  boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
  marginBottom: "1.25rem",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#888",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  marginBottom: "0.875rem",
  margin: "0 0 0.875rem",
};

const kvLabelStyle: React.CSSProperties = {
  color: "#888",
  fontSize: "0.8rem",
  width: 200,
  flexShrink: 0,
};

const kvValueStyle: React.CSSProperties = {
  color: "#222",
  fontSize: "0.875rem",
  fontWeight: 500,
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hdrs = await headers();
  const tenantId = hdrs.get("x-tenant-id") ?? "";

  const { env } = await getCloudflareContext({ async: true });
  const { DB } = env as unknown as Env;

  if (!DB) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f4f1" }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: "2.5rem 3rem", boxShadow: "0 2px 16px rgba(0,0,0,0.07)", maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#c96442", marginBottom: "0.5rem" }}>Database unavailable</h1>
          <p style={{ color: "#555" }}>The D1 binding is not configured in this environment.</p>
        </div>
      </main>
    );
  }

  const project = await DB.prepare(
    "SELECT id, name, project_type, status, current_revision_id FROM cad_projects WHERE id = ? AND tenant_id = ?"
  )
    .bind(id, tenantId)
    .first<Project>();

  if (!project) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f4f1" }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: "2.5rem 3rem", boxShadow: "0 2px 16px rgba(0,0,0,0.07)", maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#c96442", marginBottom: "0.5rem" }}>Project not found</h1>
          <p style={{ color: "#555" }}>No project with id <code>{id}</code> exists in this workspace.</p>
        </div>
      </main>
    );
  }

  const revision = project.current_revision_id
    ? await DB.prepare("SELECT revision_number, design_intent FROM cad_revisions WHERE id = ?")
        .bind(project.current_revision_id)
        .first<Revision>()
    : null;

  const designIntent = safeParseDesignIntent(revision?.design_intent);
  const brief: BriefShape = designIntent?.brief ?? {};

  const assembly = await DB.prepare(
    "SELECT id, name, description FROM cad_assemblies WHERE project_id = ? AND parent_assembly_id IS NULL ORDER BY created_at DESC LIMIT 1"
  )
    .bind(project.id)
    .first<Assembly>();

  const features: Feature[] = assembly
    ? (
        await DB.prepare(
          "SELECT id, feature_type, parameters_json, order_index FROM cad_features WHERE assembly_id = ? ORDER BY order_index ASC"
        )
          .bind(assembly.id)
          .all<Feature>()
      ).results
    : [];

  // Partition features
  const parsedFeatures = features.map((f) => ({ f, params: safeParse(f.parameters_json) }));

  const shaftEntry = parsedFeatures.find(
    ({ params }) => params?.status === "sized" && (params as { kind?: string }).kind !== "bearing"
  );
  const shaftParams = shaftEntry ? (shaftEntry.params as ShaftReportParams) : null;

  const bearingEntries = parsedFeatures.filter(
    ({ params }) => params?.status === "sized" && (params as { kind?: string }).kind === "bearing"
  );

  const declaredEntries = parsedFeatures.filter(
    ({ params }) => params?.status === "declared" || params === null
  );

  // Aggregate citations/standards
  const seenRefs = new Set<string>();
  const allRefs: string[] = [];

  if (shaftParams?.citations) {
    for (const c of shaftParams.citations) {
      if (!c.doc) continue;
      const label = `${c.doc} §${c.section}${c.page != null ? ` p.${c.page}` : ""}`;
      if (!seenRefs.has(label)) { seenRefs.add(label); allRefs.push(label); }
    }
  }
  for (const { params } of bearingEntries) {
    const b = params as BearingParams;
    if (b.standard) {
      const s = b.standard;
      if (!seenRefs.has(s)) { seenRefs.add(s); allRefs.push(s); }
    }
    if (b.reference) {
      const r = b.reference;
      if (!seenRefs.has(r)) { seenRefs.add(r); allRefs.push(r); }
    }
  }

  // Brief KV rows — omit null/undefined values
  type KVRow = { label: string; value: string };
  const briefRows: KVRow[] = [];
  const addRow = (label: string, value: string | number | null | undefined, unit?: string) => {
    if (value == null) return;
    const v = typeof value === "number"
      ? (Number.isFinite(value) ? `${value}${unit ? " " + unit : ""}` : null)
      : `${value}${unit ? " " + unit : ""}`;
    if (v == null) return;
    briefRows.push({ label, value: v });
  };

  addRow("Power", brief.power, "hp");
  addRow("Speed", brief.speed, "rpm");
  addRow("Overhang", brief.overhang, "in");
  addRow("Bearing span", brief.bearingSpan, "in");
  addRow("Material", brief.material);
  if (brief.applicationFactor != null) addRow("Application factor", brief.applicationFactor);
  addRow("Head", brief.head, "ft");
  addRow("Impeller Ø D2", brief.impellerDiameter, "in");
  addRow("Impeller width b2", brief.impellerWidth, "in");
  addRow("Specific gravity", brief.specificGravity);
  if (brief.casingType) addRow("Casing type", capitalize(brief.casingType));

  return (
    <>
      <style>{`
        @page { size: letter; margin: 0.7in; }
        @media print {
          [data-noprint] { display: none !important; }
          main { background: #fff !important; padding: 0 !important; }
          [data-card] { box-shadow: none !important; border: 1px solid #ddd; break-inside: avoid; }
        }
      `}</style>

      <main style={{ minHeight: "100vh", background: "#f5f4f1", padding: "2.5rem 1.5rem" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>

          {/* Print banner */}
          <div
            data-noprint
            style={{
              background: "#fff8e1",
              border: "1px solid #ffe082",
              borderRadius: 8,
              padding: "0.6rem 1rem",
              marginBottom: "1.25rem",
              fontSize: "0.8rem",
              color: "#7a5c00",
            }}
          >
            Press <strong>Ctrl/⌘ + P</strong> and choose &ldquo;Save as PDF&rdquo; to export this report.
          </div>

          {/* 1. Title block */}
          <div data-card style={cardStyle}>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#c96442", margin: "0 0 0.25rem" }}>
              {project.name}
            </h1>
            <p style={{ color: "#555", margin: "0 0 0.125rem", fontSize: "0.95rem" }}>
              Engineering Calculation Report
            </p>
            <p style={{ color: "#888", margin: "0 0 0.125rem", fontSize: "0.875rem" }}>
              {capitalize(project.project_type)} · {capitalize(project.status)}
              {revision ? ` · Revision ${revision.revision_number}` : ""}
            </p>
          </div>

          {/* 2. Design Inputs */}
          <div data-card style={cardStyle}>
            <p style={sectionLabelStyle}>Design Inputs</p>
            {briefRows.length === 0 ? (
              <p style={{ color: "#888", fontSize: "0.875rem", margin: 0 }}>No brief data available.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {briefRows.map((row) => (
                  <div key={row.label} style={{ display: "flex", alignItems: "baseline", gap: "1rem" }}>
                    <span style={kvLabelStyle}>{row.label}</span>
                    <span style={kvValueStyle}>{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Shaft Design Summary */}
          <div data-card style={cardStyle}>
            <p style={sectionLabelStyle}>Shaft Design Summary</p>
            {shaftParams ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "1rem" }}>
                    <span style={kvLabelStyle}>Diameter</span>
                    <span style={kvValueStyle}>
                      {shaftParams.diameter != null ? `Ø${fmtDiameter(shaftParams.diameter)} in` : "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "1rem" }}>
                    <span style={kvLabelStyle}>Material</span>
                    <span style={kvValueStyle}>{shaftParams.material ?? "—"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "1rem" }}>
                    <span style={kvLabelStyle}>Torque</span>
                    <span style={kvValueStyle}>
                      {Number.isFinite(shaftParams.torque) ? `${fmt(shaftParams.torque)} lb-in` : "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "1rem" }}>
                    <span style={kvLabelStyle}>Radial load</span>
                    <span style={kvValueStyle}>
                      {Number.isFinite(shaftParams.radialLoad) ? `${fmt(shaftParams.radialLoad)} lbf` : "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "1rem" }}>
                    <span style={kvLabelStyle}>Bending moment</span>
                    <span style={kvValueStyle}>
                      {Number.isFinite(shaftParams.bendingMoment) ? `${fmt(shaftParams.bendingMoment)} lb-in` : "—"}
                    </span>
                  </div>
                </div>
                <div>
                  <CheckChip label="Stress" passed={shaftParams.checks?.stress?.passed} />
                  <CheckChip label="Deflection" passed={shaftParams.checks?.deflection?.passed} />
                  <CheckChip label="Crit. Speed" passed={shaftParams.checks?.criticalSpeed?.passed} />
                </div>
              </>
            ) : (
              <p style={{ color: "#888", fontSize: "0.875rem", margin: 0 }}>Shaft not yet sized.</p>
            )}
          </div>

          {/* 4. Bearing Selection */}
          <div data-card style={cardStyle}>
            <p style={sectionLabelStyle}>Bearing Selection</p>
            {bearingEntries.length === 0 ? (
              <p style={{ color: "#888", fontSize: "0.875rem", margin: 0 }}>No bearings sized.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #eee" }}>
                      {["Position", "Designation", "Applied load (lbf)", "L10 life (h)", "Target (h)", "Static s₀", "Standard"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "0.35rem 0.6rem", color: "#888", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bearingEntries.map(({ f, params }) => {
                      const b = params as BearingParams;
                      return (
                        <tr key={f.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "0.4rem 0.6rem", color: "#222" }}>
                            {capitalize(f.feature_type)} #{f.order_index}
                          </td>
                          <td style={{ padding: "0.4rem 0.6rem", color: "#222" }}>
                            {b.designation ? `SKF ${b.designation}` : "—"}
                          </td>
                          <td style={{ padding: "0.4rem 0.6rem", color: "#222" }}>
                            {Number.isFinite(b.appliedRadialLoad_lbf) ? fmt(b.appliedRadialLoad_lbf) : "—"}
                          </td>
                          <td style={{ padding: "0.4rem 0.6rem", color: "#222" }}>
                            {Number.isFinite(b.ratingLife_L10h) ? Math.round(b.ratingLife_L10h).toLocaleString() : "—"}
                          </td>
                          <td style={{ padding: "0.4rem 0.6rem", color: "#222" }}>
                            {Number.isFinite(b.targetLifeHours) ? Math.round(b.targetLifeHours).toLocaleString() : "—"}
                          </td>
                          <td style={{ padding: "0.4rem 0.6rem", color: "#222" }}>
                            {b.staticSafetyFactor != null && Number.isFinite(b.staticSafetyFactor)
                              ? b.staticSafetyFactor.toFixed(1)
                              : "—"}
                          </td>
                          <td style={{ padding: "0.4rem 0.6rem", color: "#555" }}>
                            {b.standard ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 5. Components Pending Sizing — omit section if none */}
          {declaredEntries.length > 0 && (
            <div data-card style={cardStyle}>
              <p style={sectionLabelStyle}>Components Pending Sizing</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {declaredEntries.map(({ f, params }) => {
                  const d = params as DeclaredParams | null;
                  return (
                    <div key={f.id} style={{ display: "flex", gap: "1rem", alignItems: "baseline" }}>
                      <span style={{ ...kvLabelStyle, color: "#555" }}>{capitalize(f.feature_type)}</span>
                      <span style={{ color: "#888", fontSize: "0.8rem" }}>
                        {d?.note ?? "Awaiting sizing"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. Governing Standards & References */}
          <div data-card style={cardStyle}>
            <p style={sectionLabelStyle}>Governing Standards &amp; References</p>
            {allRefs.length === 0 ? (
              <p style={{ color: "#888", fontSize: "0.875rem", margin: 0 }}>Standards lookup returned none.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {allRefs.map((ref, i) => (
                  <li key={i} style={{ color: "#555", fontSize: "0.875rem" }}>{ref}</li>
                ))}
              </ul>
            )}
          </div>

          {/* 7. Footer / signature */}
          <div
            data-card
            style={{
              ...cardStyle,
              background: "#faf9f7",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              borderTop: "2px solid #e5e4e0",
            }}
          >
            <p style={{ color: "#555", fontSize: "0.8rem", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
              <strong>DRAFT</strong> &mdash; generated by NEXUS. All engineering outputs require review and
              stamping by a licensed Professional Engineer (Connor McNeely, PE). Bearing catalog ratings are
              provisional pending catalog verification.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <span style={{ color: "#888", fontSize: "0.8rem", minWidth: 140 }}>PE review:</span>
                <span style={{ flex: 1, borderBottom: "1px solid #aaa", minWidth: 200 }}>&nbsp;</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <span style={{ color: "#888", fontSize: "0.8rem", minWidth: 140 }}>Date:</span>
                <span style={{ flex: 1, borderBottom: "1px solid #aaa", minWidth: 200 }}>&nbsp;</span>
              </div>
            </div>
          </div>

        </div>
      </main>
    </>
  );
}
