import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for load balancers and Docker healthchecks. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, status: "healthy", timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, status: "degraded", detail: "database unreachable" }, { status: 503 });
  }
}
