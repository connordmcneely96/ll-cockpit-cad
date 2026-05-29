import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  try {
    const { env } = getCloudflareContext();

    let db = false;
    try {
      await (env.DB as D1Database).prepare("SELECT 1").first();
      db = true;
    } catch { db = false; }

    let r2 = false;
    try {
      await (env.R2 as R2Bucket).list({ limit: 1 });
      r2 = true;
    } catch { r2 = false; }

    const hub = typeof (env.HUB as { fetch?: unknown })?.fetch === "function";

    return NextResponse.json({
      status: "healthy",
      worker: "cad",
      version: "0.1.0",
      db,
      r2,
      hub,
    });
  } catch (e) {
    return NextResponse.json(
      { status: "error", message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
