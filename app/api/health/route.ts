import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

// Inline duck-typed Env — avoids depending on a generated CloudflareEnv that
// doesn't declare these bindings (Sprint 18B ADR: cast via `as unknown as Env`,
// no @cloudflare/workers-types). The generated CloudflareEnv has no DB/R2/HUB,
// so `env.DB` type-errors unless we cast the whole env object to a local type.
type D1 = { prepare: (sql: string) => { first: () => Promise<unknown> } };
type R2 = { list: (opts: { limit: number }) => Promise<unknown> };
type Hub = { fetch: (req: Request) => Promise<Response> };
type Env = { DB?: D1; R2?: R2; HUB?: Hub };

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  const { DB, R2, HUB } = env as unknown as Env;

  let db = false;
  if (DB) {
    try {
      await DB.prepare("SELECT 1").first();
      db = true;
    } catch {
      db = false;
    }
  }

  let r2 = false;
  if (R2) {
    try {
      await R2.list({ limit: 1 });
      r2 = true;
    } catch {
      r2 = false;
    }
  }

  const hub = typeof HUB?.fetch === "function";

  const healthy = db && r2 && hub;
  return Response.json(
    {
      status: healthy ? "healthy" : "degraded",
      worker: "cad",
      version: "0.1.0",
      db,
      r2,
      hub,
    },
    { status: healthy ? 200 : 503 }
  );
}
