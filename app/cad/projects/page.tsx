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

type ProjectRow = {
  id: string;
  name: string | null;
  project_type: string | null;
  status: string | null;
  created_at: string | null;
};

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

export default async function Page() {
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

  const { results: projects } = await DB.prepare(
    "SELECT id, name, project_type, status, created_at FROM cad_projects WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100"
  )
    .bind(tenantId)
    .all<ProjectRow>();

  return (
    <main style={{ minHeight: "100vh", background: "#f5f4f1", padding: "2.5rem 1.5rem" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "#c96442", margin: "0 0 0.25rem" }}>
          CAD Projects
        </h1>
        <p style={{ color: "#888", fontSize: "0.875rem", margin: "0 0 1.5rem" }}>
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </p>

        {projects.length === 0 ? (
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "1.5rem 2rem",
              boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
              color: "#555",
            }}
          >
            No projects yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {projects.map((row) => {
              const subParts: string[] = [];
              if (row.project_type) subParts.push(capitalize(row.project_type));
              if (row.status) subParts.push(capitalize(row.status));
              if (row.created_at) subParts.push(row.created_at.slice(0, 10));
              const subLine = subParts.join(" · ");

              return (
                <div
                  key={row.id}
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: "1.25rem 1.5rem",
                    boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <a
                      href={`/cad/projects/${row.id}`}
                      style={{ fontWeight: 700, color: "#222", textDecoration: "none", fontSize: "1rem" }}
                    >
                      {row.name ?? "(untitled)"}
                    </a>
                    {subLine && (
                      <p style={{ color: "#888", fontSize: "0.8rem", margin: "0.25rem 0 0" }}>
                        {subLine}
                      </p>
                    )}
                  </div>
                  <a
                    href={`/cad/projects/${row.id}/report`}
                    style={{ color: "#c96442", fontSize: "0.8rem", textDecoration: "none", whiteSpace: "nowrap", paddingTop: "0.125rem", flexShrink: 0 }}
                  >
                    View report →
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
