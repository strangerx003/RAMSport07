/**
 * Catch-all route handler for the RAMSport `/api/*` contract.
 *
 * All endpoints run in the Node.js runtime because they need the filesystem
 * fallback and the MongoDB driver. Responses are never cached.
 */

import { handleApi } from "@/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type RouteContext = { params: Promise<{ path?: string[] }> };

async function dispatch(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return handleApi(request, path ?? []);
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
export const HEAD = dispatch;
