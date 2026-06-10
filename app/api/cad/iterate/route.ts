import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { validateToken } from "@/lib/auth";
import { iterate, type ShaftBrief } from "@/lib/iterate";
import { getManifest } from "@/lib/assembly-manifest";
import { computeOverhungReactions, selectBearing } from "@/lib/bearings";

export const dynamic = "force-dynamic";

// Inline duck-typed Env (Sprint 18B ADR — cast the whole env object, do not rely
// on the generated CloudflareEnv which lacks these bindings). No cloudflare:* imports.
type D1Stmt = {
  bind: (...vals: unknown[]) => D1Stmt;
  run: () => Promise<unknown>;
  first: <T = unknown>() => Promise<T | null>;
};
type D1 = { prepare: (sql: string) => D1Stmt };
type ServiceBinding = { fetch: (req: Request) => Promise<Response> };
type Env = {
  DB?: D1;
  CALCS?: ServiceBinding;
  HUB?: ServiceBinding;
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

// ── ATLAS citation wiring (Sprint 30I unstub) ──
// After a design converges, ask ATLAS (hub /api/atlas/query, reached via the HUB
// service binding — never a public URL) for the governing standard behind each
// engineering check. Best-effort: any failure (non-200, rejected, empty sources)
// simply omits that check's citation. A converged design NEVER fails because a
// citation lookup hiccuped — citations are an annotation layer, not a dependency.
interface Citation {
  check: string;
  doc: string;
  section: string;
  page: number | null;
}

const CITATION_QUERIES: { check: string; question: string }[] = [
  {
    check: "stress",
    question:
      "What standard and formula governs combined bending and torsional (von Mises) stress on a rotating shaft?",
  },
  {
    check: "deflection",
    question:
      "What governs allowable lateral deflection of a shaft under radial load?",
  },
  {
    check: "critical_speed",
    question:
      "What standard governs rotordynamic critical speed margin for a rotating shaft or pump rotor?",
  },
];

async function fetchCitations(
  HUB: ServiceBinding | undefined,
  material: string,
  projectType: string
): Promise<Citation[]> {
  if (!HUB) return [];
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const { check, question } of CITATION_QUERIES) {
    try {
      const resp = await HUB.fetch(
        new Request(
          "https://hub.internal/api/atlas/query?secret=engineering-30b",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question,
              project_context: `${projectType} shaft, material ${material}`,
              max_sources: 3,
            }),
          }
        )
      );
      if (!resp.ok) continue;
      const data = (await resp.json()) as {
        sources?: { doc: string; section: string; page: number | null }[];
        rejected?: boolean;
      };
      if (data.rejected || !data.sources) continue;
      for (const s of data.sources) {
        if (!s.doc) continue;
        const key = `${check}::${s.doc}::${s.section}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ check, doc: s.doc, section: s.section, page: s.page ?? null });
      }
    } catch {
      // best-effort: a citation failure never breaks a converged design
    }
  }
  return out;
}

export async function POST(req: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Env;
  const { DB, CALCS, HUB } = e;

  // Secrets: OpenNext populates wrangler-put secrets on process.env (nodejs_compat)
  // and on getCloudflareContext().env in some versions. Read env first, fall back
  // to process.env — robust to whichever path is populated.
  const CAD_ITERATE_SECRET =
    e.CAD_ITERATE_SECRET ?? process.env.CAD_ITERATE_SECRET;
  const CALC_SECRET = e.CALC_SECRET ?? process.env.CALC_SECRET;

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
  } catch (err) {
    return json(
      { error: "invalid_body", message: err instanceof Error ? err.message : String(err) },
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
  } catch (err) {
    return json(
      { error: "project_insert_failed", message: err instanceof Error ? err.message : String(err) },
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
  } catch (err) {
    // Calc-engine failure — surface as 502, leave the project row for debugging.
    return json(
      {
        error: "calc_engine_failure",
        projectId,
        message: err instanceof Error ? err.message : String(err),
      },
      502
    );
  }

  // --- ATLAS citations: computed ONCE after convergence (never inside the loop) ---
  // Best-effort; an empty array is acceptable. Annotates the final converged design.
  const citations = await fetchCitations(HUB, result.gen.material, brief.projectType);

  // --- Persist one revision per iteration, chained via parent_revision_id ---
  // Citations are attached to the FINAL revision's design_intent (they describe the
  // converged design, computed once after the loop).
  let parentRevisionId: string | null = null;
  let lastRevisionId: string | null = null;
  const lastIndex = result.iterations.length - 1;
  for (let i = 0; i < result.iterations.length; i++) {
    const entry = result.iterations[i];
    const revisionId = crypto.randomUUID();
    const designIntent = JSON.stringify({
      brief,
      diameter: entry.diameter,
      stressPassed: entry.stressPassed,
      deflectionPassed: entry.deflectionPassed,
      criticalSpeedPassed: entry.criticalSpeedPassed,
      ...(i === lastIndex ? { citations } : {}),
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
    } catch (err) {
      return json(
        {
          error: "revision_insert_failed",
          projectId,
          message: err instanceof Error ? err.message : String(err),
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
  } catch (err) {
    return json(
      { error: "project_update_failed", projectId, message: err instanceof Error ? err.message : String(err) },
      500
    );
  }

  // --- Assembly tree (Sprint 30L foundation) ---
  // Write one top-level cad_assembly + N cad_feature rows from the project-type
  // manifest. ONLY the sized shaft feature carries real parameters (diameter, loads,
  // the three checks, citations); declared features are honest empty slots awaiting
  // sizing in 30L-2 — we never fabricate parameters for un-sized components.
  // parent_assembly_id / parent_feature_id stay NULL this slice (flat assembly;
  // sub-trees arrive with 30L-2). The assembly IS the new deliverable, so a hard
  // failure here surfaces as 500 (the project + revisions already persisted).
  const assemblyId = crypto.randomUUID();
  try {
    await DB.prepare(
      `INSERT INTO cad_assemblies (id, project_id, parent_assembly_id, name, description, position_json)
       VALUES (?, ?, NULL, ?, ?, ?)`
    )
      .bind(
        assemblyId,
        projectId,
        brief.name,
        `Top-level ${brief.projectType} assembly`,
        JSON.stringify({ x: 0, y: 0, z: 0 })
      )
      .run();

    const manifest = getManifest(brief.projectType);

    const reactions =
      brief.projectType === "pump"
        ? computeOverhungReactions(result.gen.radialLoad, brief.overhang, brief.bearingSpan)
        : null;

    for (const comp of manifest) {
      const featureId = crypto.randomUUID();

      let params: unknown;

      if (comp.status === "sized") {
        params = {
          status: "sized",
          diameter: result.finalDiameter,
          material: result.gen.material,
          torque: result.gen.torque,
          radialLoad: result.gen.radialLoad,
          bendingMoment: result.gen.bendingMoment,
          checks: {
            stress: result.finalChecks.stress,
            deflection: result.finalChecks.deflection,
            criticalSpeed: result.finalChecks.critical,
          },
          citations,
        };
      } else if (
        brief.projectType === "pump" &&
        comp.feature_type === "bearing" &&
        reactions !== null
      ) {
        const reaction =
          comp.order_index === 1
            ? reactions.driveEnd
            : comp.order_index === 2
            ? reactions.nonDrive
            : null;

        if (reaction !== null) {
          try {
            const sel = await selectBearing(
              { CALCS: CALCS!, CALC_SECRET: CALC_SECRET ?? undefined },
              {
                shaftDiameter: result.finalDiameter,
                appliedRadialLoad: reaction,
                speed: brief.speed,
                targetLifeHours: 25000,
              }
            );
            if (sel.bearing !== null) {
              params = {
                status: "sized",
                kind: "bearing",
                designation: sel.bearing.designation,
                series: sel.bearing.series,
                bore_in: sel.bearing.bore_in,
                dynamicLoadRating_lbf: sel.bearing.C_lbf,
                staticLoadRating_lbf: sel.bearing.C0_lbf,
                appliedRadialLoad_lbf: reaction,
                ratingLife_L10h: sel.life.basicRatingLife_hours,
                staticSafetyFactor: sel.life.staticSafetyFactor,
                targetLifeHours: 25000,
                standard: "ISO 281:2007",
                reference: sel.life.reference,
                formula: sel.life.formula,
                note: "C/C0 from embedded SKF catalog — PE-verify before deliverable.",
              };
            } else {
              params = { status: "declared", note: sel.reason };
            }
          } catch {
            params = { status: "declared", note: "Bearing life calc unavailable" };
          }
        } else {
          params = { status: "declared", note: "Awaiting sizing (Sprint 30L-2 composer)" };
        }
      } else {
        params = { status: "declared", note: "Awaiting sizing (Sprint 30L-2 composer)" };
      }

      await DB.prepare(
        `INSERT INTO cad_features (id, assembly_id, parent_feature_id, feature_type, parameters_json, order_index)
         VALUES (?, ?, NULL, ?, ?, ?)`
      )
        .bind(featureId, assemblyId, comp.feature_type, JSON.stringify(params), comp.order_index)
        .run();
    }
  } catch (err) {
    return json(
      { error: "assembly_insert_failed", projectId, message: err instanceof Error ? err.message : String(err) },
      500
    );
  }

  const summary = result.converged
    ? `Converged to ${result.finalDiameter.toFixed(2)} in ${result.gen.material} in ${result.totalIterations} iteration${result.totalIterations === 1 ? "" : "s"}.`
    : `Did not converge within ${result.totalIterations} iterations (diameter capped at ${result.finalDiameter.toFixed(2)} in). Manual review required.`;

  return json({
    projectId,
    assemblyId,
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
    citations, // Sprint 30I unstub — real ATLAS spec citations (best-effort)
    requiresConnorReview: true, // every output is gated by Connor's PE review
    summary,
  });
}
