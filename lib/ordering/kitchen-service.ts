import "server-only";
import { NextResponse } from "next/server";
import { kitchenRole } from "./auth";
import { getStore } from "./store";
import { buildIndex, loadMenuDoc, toOrderable } from "./menu";
import { isOperationId, parseCommand, prepare, rejected, replay, revisionOf, type Command, type Receipt } from "./kitchen-operations";

export const kitchenHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export const kitchenReply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: kitchenHeaders });
const recorded = (receipt: Receipt) => kitchenReply(receipt.response, receipt.httpStatus);

async function readBody(req: Request): Promise<unknown> {
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !req.body) return null;
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 8192) { await reader.cancel(); return null; } chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return null; } finally { reader.releaseLock(); }
}

export async function runKitchenAction(req: Request, kind: Command["kind"]) {
  const actor = await kitchenRole();
  if (!actor) return kitchenReply({ error: "Sign in to the kitchen again." }, 401);
  let operationId: string | undefined;
  try {
    const store = getStore();
    if (process.env.NODE_ENV === "production" && store.backend !== "postgres") return kitchenReply({ error: "Persistent kitchen storage is unavailable.", outcome: "unknown" }, 503);
    const raw = await readBody(req);
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !isOperationId((raw as Record<string, unknown>).operationId)) return kitchenReply({ error: "Refresh this board before changing it." }, 400);
    operationId = (raw as { operationId: string }).operationId;
    const fingerprint = revisionOf({ kind, body: raw }), prior = await store.getOperation(operationId);
    if (prior) return recorded(replay(prior, fingerprint));
    const deny = async (error: string, status = 400) => recorded(await store.commitKitchen(rejected(operationId!, fingerprint, kind, actor, error, status), null));
    const command = parseCommand(raw, kind); if (!command) return deny("The action is incomplete or invalid. Refresh the board and review it again.");
    if (kind === "state" && command.change && "itemId" in command.change) {
      const menu = buildIndex(toOrderable(await loadMenuDoc(store), { includeHidden: true }));
      if (!menu.has(command.change.itemId) && command.change.unavailable) return deny("This item is no longer on the ordering menu.");
    }
    const current = kind === "state" ? await store.getStateRecord() : await store.getOrder(command.orderId!);
    const result = prepare(command, current, actor, fingerprint);
    return recorded(await store.commitKitchen(result.receipt, result.candidate));
  } catch { return kitchenReply({ operationId, outcome: "unknown", error: "The action could not be confirmed. Check its result or retry the same action." }, 503); }
}
