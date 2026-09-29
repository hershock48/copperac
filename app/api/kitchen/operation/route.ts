import { NextRequest } from "next/server";
import { isKitchenAuthed } from "@/lib/ordering/auth";
import { getStore } from "@/lib/ordering/store";
import { isOperationId } from "@/lib/ordering/kitchen-operations";
import { kitchenReply } from "@/lib/ordering/kitchen-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isKitchenAuthed())) return kitchenReply({ error: "Sign in to check this action." }, 401);
  const id = req.nextUrl.searchParams.get("id");
  if (!isOperationId(id)) return kitchenReply({ error: "Missing action reference." }, 400);
  try {
    const store = getStore();
    if (process.env.NODE_ENV === "production" && store.backend !== "postgres") throw Error("Persistent storage unavailable");
    const result = await store.getOperation(id);
    return result ? kitchenReply(result.response) : kitchenReply({ operationId: id, outcome: "unknown", error: "No saved result yet. Retry the same action or check again." }, 202);
  } catch { return kitchenReply({ operationId: id, outcome: "unknown", error: "The action result could not be checked." }, 503); }
}
