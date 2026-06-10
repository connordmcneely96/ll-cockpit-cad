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

type SizedParams = {
  status: "sized";
  diameter: number;
  material: string;
  checks?: {
    stress?: { passed?: boolean };
    deflection?: { passed?: boolean };
    criticalSpeed?: { passed?: boolean };
  };
  citations?: { check: string; doc: string; section: string; page: number | null }[];
};

type DeclaredParams = {
  status: "declared";
  note?: string;
};

type FeatureParams = SizedParams | DeclaredParams | null;

function safeParse(s: string | null | undefined): FeatureParams {
  if (!s) return null;
  try {
    return JSON.parse(s) as FeatureParams;
  } catch {
    return null;
  }
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
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

  return (
    <main style={{ minHeight: "100vh", background: "#f5f4f1", padding: "2.5rem 1.5rem" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "0.25rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "#c96442", margin: 0 }}>{project.name}</h1>
        </div>
        <p style={{ color: "#555", margin: "0.25rem 0 0.125rem" }}>
          {capitalize(project.project_type)} · {capitalize(project.status)}
        </p>
        {revision && (
          <p style={{ color: "#888", fontSize: "0.875rem", margin: "0.125rem 0 0" }}>
            Revision {revision.revision_number}
          </p>
        )}
        <p style={{ color: "#888", fontSize: "0.8rem", marginTop: "0.75rem", marginBottom: "1.5rem" }}>
          Engineering outputs require Connor&apos;s PE review.
        </p>

        {/* No assembly */}
        {!assembly ? (
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "1.5rem 2rem",
              boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
              color: "#555",
            }}
          >
            No assembly tree yet for this project.
          </div>
        ) : (
          <>
            {/* Assembly label */}
            <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
              {assembly.name}
            </p>

            {/* Feature cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {features.map((f) => {
                const params = safeParse(f.parameters_json);
                const isSized = params?.status === "sized";

                if (isSized) {
                  const p = params as SizedParams;
                  const citations = Array.isArray(p.citations) ? p.citations : [];
                  return (
                    <div
                      key={f.id}
                      style={{
                        background: "#fff",
                        borderRadius: 12,
                        padding: "1.25rem 1.5rem",
                        boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
                      }}
                    >
                      <p style={{ fontWeight: 700, color: "#222", margin: "0 0 0.25rem", fontSize: "1rem" }}>
                        {capitalize(f.feature_type)}
                      </p>
                      <p style={{ color: "#555", fontSize: "0.875rem", margin: "0 0 0.75rem" }}>
                        {p.diameter != null ? `Ø${p.diameter} in` : "Ø— in"} · {p.material ?? "—"}
                      </p>
                      <div style={{ marginBottom: "0.75rem" }}>
                        <CheckChip label="Stress" passed={p.checks?.stress?.passed} />
                        <CheckChip label="Deflection" passed={p.checks?.deflection?.passed} />
                        <CheckChip label="Crit. Speed" passed={p.checks?.criticalSpeed?.passed} />
                      </div>
                      <div>
                        {citations.length > 0 ? (
                          citations.map((c, i) => (
                            <p key={i} style={{ fontSize: "0.75rem", color: "#888", margin: "0.1rem 0" }}>
                              {c.doc} §{c.section}{c.page != null ? ` p.${c.page}` : ""}
                            </p>
                          ))
                        ) : (
                          <p style={{ fontSize: "0.75rem", color: "#aaa", margin: 0 }}>no citations</p>
                        )}
                      </div>
                    </div>
                  );
                }

                // declared or unknown
                const p = params as DeclaredParams | null;
                return (
                  <div
                    key={f.id}
                    style={{
                      background: "#faf9f7",
                      borderRadius: 12,
                      padding: "1.25rem 1.5rem",
                      boxShadow: "0 2px 16px rgba(0,0,0,0.04)",
                      opacity: 0.7,
                    }}
                  >
                    <p style={{ fontWeight: 600, color: "#555", margin: "0 0 0.25rem", fontSize: "1rem" }}>
                      {capitalize(f.feature_type)}
                    </p>
                    <p style={{ color: "#888", fontSize: "0.875rem", margin: 0 }}>
                      {p?.note ?? "Declared — awaiting sizing"}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
