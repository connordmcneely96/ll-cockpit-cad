import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Inline duck-typed Env (Sprint 18B ADR). No cloudflare:* imports.
type D1Result<T> = { results?: T[] };
type D1Stmt = {
  bind: (...vals: unknown[]) => D1Stmt;
  first: <T = unknown>() => Promise<T | null>;
  all: <T = unknown>() => Promise<D1Result<T>>;
};
type D1 = { prepare: (sql: string) => D1Stmt };
type Env = { DB?: D1; CAD_ITERATE_SECRET?: string };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function safeParse(s: string | null): unknown {
  if (s == null) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s; // fall back to raw string if a column isn't valid JSON
  }
}

// Read the assembly tree for a project.
// Auth mirrors /api/cad/iterate: X-Cad-Iterate-Secret header bypass OR sb-access-token
// cookie. ADDITIONALLY accepts ?secret= as a query fallback so the tree is checkable
// from a plain browser address bar (GET, no terminal) — interim, same secret value,
// same surface as the atlas routes' ?secret= gate.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: projectId } = await ctx.params;

  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Env;
  const { DB } = e;
  const CAD_ITERATE_SECRET = e.CAD_ITERATE_SECRET ?? process.env.CAD_ITERATE_SECRET;

  if (!DB) {
    return json({ error: "bindings_missing", db: false }, 500);
  }

  // --- Auth: header secret OR ?secret= query (browser) OR sb-access-token cookie ---
  const url = new URL(req.url);
  const headerSecret = req.headers.get("X-Cad-Iterate-Secret");
  const querySecret = url.searchParams.get("secret");
  const secretOk =
    !!CAD_ITERATE_SECRET &&
    (headerSecret === CAD_ITERATE_SECRET || querySecret === CAD_ITERATE_SECRET);

  let tenantScope: string | null;
  if (secretOk) {
    tenantScope = "default"; // smoke path scopes to the default tenant
  } else {
    const cookie = req.headers.get("cookie") ?? "";
    const match = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
    const token = match ? decodeURIComponent(match[1]) : null;
    const auth = token ? await validateToken(token) : null;
    if (!auth) {
      return json({ error: "unauthorized" }, 401);
    }
    tenantScope = auth.tenantId;
  }

  // --- Project (scoped to tenant) ---
  const project = await DB.prepare(
    `SELECT id, name, project_type, status, current_revision_id, tenant_id
     FROM cad_projects WHERE id = ? AND tenant_id = ?`
  )
    .bind(projectId, tenantScope)
    .first<{
      id: string;
      name: string;
      project_type: string;
      status: string;
      current_revision_id: string | null;
      tenant_id: string;
    }>();

  if (!project) {
    return json({ error: "not_found", projectId }, 404);
  }

  // --- Current revision (if any) ---
  let revision: {
    id: string;
    revision_number: number;
    design_intent: unknown;
  } | null = null;
  if (project.current_revision_id) {
    const row = await DB.prepare(
      `SELECT id, revision_number, design_intent FROM cad_revisions WHERE id = ?`
    )
      .bind(project.current_revision_id)
      .first<{ id: string; revision_number: number; design_intent: string | null }>();
    if (row) {
      revision = {
        id: row.id,
        revision_number: row.revision_number,
        design_intent: safeParse(row.design_intent),
      };
    }
  }

  // --- Top-level assembly (parent_assembly_id IS NULL), newest first ---
  const assemblyRow = await DB.prepare(
    `SELECT id, name, description, position_json
     FROM cad_assemblies
     WHERE project_id = ? AND parent_assembly_id IS NULL
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(projectId)
    .first<{ id: string; name: string; description: string | null; position_json: string | null }>();

  let assembly: {
    id: string;
    name: string;
    description: string | null;
    position_json: unknown;
  } | null = null;
  let features: {
    id: string;
    feature_type: string;
    parameters_json: unknown;
    order_index: number;
  }[] = [];

  if (assemblyRow) {
    assembly = {
      id: assemblyRow.id,
      name: assemblyRow.name,
      description: assemblyRow.description,
      position_json: safeParse(assemblyRow.position_json),
    };

    const featRows = await DB.prepare(
      `SELECT id, feature_type, parameters_json, order_index
       FROM cad_features WHERE assembly_id = ? ORDER BY order_index ASC`
    )
      .bind(assemblyRow.id)
      .all<{ id: string; feature_type: string; parameters_json: string | null; order_index: number }>();

    features = (featRows.results ?? []).map((f) => ({
      id: f.id,
      feature_type: f.feature_type,
      parameters_json: safeParse(f.parameters_json),
      order_index: f.order_index,
    }));
  }

  return json({
    project: {
      id: project.id,
      name: project.name,
      project_type: project.project_type,
      status: project.status,
      current_revision_id: project.current_revision_id,
    },
    revision,
    assembly,
    features,
  });
}
