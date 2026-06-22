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

export default async function CadPage() {
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

  const row = await DB.prepare(
    "SELECT COUNT(*) AS n FROM cad_projects WHERE tenant_id = ?"
  )
    .bind(tenantId)
    .first<{ n: number }>();

  const count = row?.n ?? 0;

  return (
    <main style={{ minHeight: "100vh", background: "#f5f4f1", padding: "3rem 1.5rem" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: "2.5rem 3rem",
            boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
            marginBottom: "1.5rem",
          }}
        >
          <h1 style={{ fontSize: "2.25rem", fontWeight: 800, color: "#c96442", margin: "0 0 0.75rem" }}>
            NEXUS CAD
          </h1>
          <p style={{ color: "#555", margin: "0 0 1.75rem", fontSize: "1rem", lineHeight: 1.6 }}>
            AI engineering design workspace — briefs in, stamped-ready calculations out.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            <span style={{ color: "#888", fontSize: "0.9rem" }}>
              {count} project{count === 1 ? "" : "s"} in your workspace
            </span>
            <a
              href="/cad/projects"
              style={{
                background: "#c96442",
                color: "#fff",
                padding: "0.6rem 1.2rem",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 600,
                display: "inline-block",
                fontSize: "0.9rem",
              }}
            >
              Browse Projects →
            </a>
          </div>
        </div>
        <p style={{ color: "#888", fontSize: "0.8rem", textAlign: "center", margin: 0 }}>
          Engineering outputs require review and stamping by a licensed PE.
        </p>
      </div>
    </main>
  );
}
