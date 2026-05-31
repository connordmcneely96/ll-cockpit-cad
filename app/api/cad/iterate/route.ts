import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { validateToken } from "@/lib/auth";
import { iterate, type ShaftBrief } from "@/lib/iterate";

export const dynamic = "force-dynamic";

// Inline duck-typed Env (Sprint 18B ADR — cast the whole env object, do not rely
// on the generated CloudflareEnv which lacks these bindings). No cloudflare:* imports.
type D1Stmt = {
  bind: (...vals: unknown[]) => D1Stmt;
  run: () => Promise<unknown>;
  first: <T = unknown>() => Promise<T | null>;
};
type D1 = { prepare: (sql: string) => D1Stmt };
type CalcsBinding = { fetch: (req: Request) => Promise<Response> };
type Env = {
  DB?: D1;
  CALCS?: CalcsBinding;
  CALC_SECRET?: string;
  CAD_ITERATE_SECRET?: string;
};

const BriefSchema = z.object({
  name: z.string().min(1),
  power: z.number().positive(),
  speed: z.number().positive(),
  overhang: z.number().positive(),
  bearingSpan: z.number().positive(),
  material: z.string().min(1),
  applicationFactor: z.number().positive().optional().default(1.5),
  projectType: z
    .enum([
      "engine",
      "pump",
      "gear_reducer",
      "pressure_vessel",
      "fluid_system",
      "structural",
      "other",
    ])
    .optional()
    .default("pump"),
  maxIterations: z.number().int().min(1).max(10).optional().default(5),
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export async function POST(req: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  const { DB, CALCS, CALC_SECRET, CAD_ITERATE_SECRET } = env as unknown as Env;

  // --- Auth: secret-header bypass (smoke) OR sb-access-token cookie (prod) ---
  let userId: string;
  let tenantId: string;

  const providedSecret = req.headers.get("X-Cad-Iterate-Secret");
  if (CAD_ITERATE_SECRET && providedSecret === CAD_ITERATE_SECRET) {
    userId = "smoke-test";
    tenantId = "default";
  } else {
    const cookie = req.headers.get("cookie") ?? "";
    const match = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
    const token = match ? decodeURIComponent(match[1]) : null;
    const auth = token ? await validateToken(token) : null;
    if (!auth) {
      return json({ error: "unauthorized" }, 401);
    }
    userId = auth.userId;
    tenantId = auth.tenantId;
  }

  if (!DB || !CALCS) {
    return json({ error: "bindings_missing", db: !!DB, calcs: !!CALCS }, 500);
  }

  // --- Parse + validate body ---
  let brief: z.infer<typeof BriefSchema>;
  try {
    brief = BriefSchema.parse(await req.json());
  } catch (e) {
    return json(
      { error: "invalid_body", message: e instanceof Error ? e.message : String(e) },
      400
    );
  }

  const runId = crypto.randomUUID();
  const projectId = crypto.randomUUID();

  // --- Create the project (status design_in_progress) ---
  try {
    await DB.prepare(
      `INSERT INTO cad_projects (id, tenant_id, user_id, name, project_type, status, total_cost_usd, total_tokens)
       VALUES (?, ?, ?, ?, ?, 'design_in_progress', 0, 0)`
    )
      .bind(projectId, tenantId, userId, brief.name, brief.projectType)
      .run();
  } catch (e) {
    return json(
      { error: "project_insert_failed", message: e instanceof Error ? e.message : String(e) },
      500
    );
  }

  // --- Run the convergence loop ---
  let result;
  try {
    const shaftBrief: ShaftBrief = {
      power: brief.power,
      speed: brief.speed,
      overhang: brief.overhang,
      bearingSpan: brief.bearingSpan,
      material: brief.material,
      applicationFactor: brief.applicationFactor,
    };
    result = await iterate(
      { CALCS, CALC_SECRET },
      shaftBrief,
      brief.maxIterations
    );
  } catch (e) {
    // Calc-engine failure — surface as 502, leave the project row for debugging.
    return json(
      {
        error: "calc_engine_failure",
        projectId,
        message: e instanceof Error ? e.message : String(e),
      },
      502
    );
  }

  // --- Persist one revision per iteration, chained via parent_revision_id ---
  let parentRevisionId: string | null = null;
  let lastRevisionId: string | null = null;
  for (const entry of result.iterations) {
    const revisionId = crypto.randomUUID();
    const designIntent = JSON.stringify({
      brief,
      diameter: entry.diameter,
      stressPassed: entry.stressPassed,
      deflectionPassed: entry.deflectionPassed,
      criticalSpeedPassed: entry.criticalSpeedPassed,
    });
    try {
      await DB.prepare(
        `INSERT INTO cad_revisions (id, project_id, revision_number, parent_revision_id, iteration_agent_run_id, design_intent, cost_usd, tokens)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0)`
      )
        .bind(
          revisionId,
          projectId,
          entry.iteration,
          parentRevisionId,
          runId,
          designIntent
        )
        .run();
    } catch (e) {
      return json(
        {
          error: "revision_insert_failed",
          projectId,
          message: e instanceof Error ? e.message : String(e),
        },
        500
      );
    }
    parentRevisionId = revisionId;
    lastRevisionId = revisionId;
  }

  // --- Update project: current revision + status ---
  try {
    await DB.prepare(
      `UPDATE cad_projects
       SET current_revision_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(
        lastRevisionId,
        result.converged ? "ready_for_delivery" : "design_in_progress",
        projectId
      )
      .run();
  } catch (e) {
    return json(
      { error: "project_update_failed", projectId, message: e instanceof Error ? e.message : String(e) },
      500
    );
  }

  const summary = result.converged
    ? `Converged to ${result.finalDiameter.toFixed(2)} in ${result.gen.material} in ${result.totalIterations} iteration${result.totalIterations === 1 ? "" : "s"}.`
    : `Did not converge within ${result.totalIterations} iterations (diameter capped at ${result.finalDiameter.toFixed(2)} in). Manual review required.`;

  return json({
    projectId,
    runId,
    converged: result.converged,
    totalIterations: result.totalIterations,
    finalDesign: {
      diameter: result.finalDiameter,
      material: result.gen.material,
      torque: result.gen.torque,
      radialLoad: result.gen.radialLoad,
      bendingMoment: result.gen.bendingMoment,
    },
    finalAnalysis: {
      stress: result.finalChecks.stress,
      deflection: result.finalChecks.deflection,
      criticalSpeed: result.finalChecks.critical,
    },
    iterations: result.iterations,
    citations: [], // STUB — wired in Sprint 30E (ATLAS RAG)
    requiresConnorReview: true, // every output is gated by Connor's PE review
    summary,
  });
}
