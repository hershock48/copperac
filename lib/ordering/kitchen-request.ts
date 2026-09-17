export type KitchenDraft = { id: string; kind: "state" | "order"; body: string };
export type KitchenResult = { outcome: "applied" | "rejected" | "unknown"; error?: string; order?: { id: string; number: number; status: string; guestPhone: string; paid: boolean } };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const revision = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const uncertain = (): KitchenResult => ({ outcome: "unknown", error: "This action may already be saved. Check its result or retry the same action." });

export function readKitchenResult(raw: unknown, draft: KitchenDraft): KitchenResult {
  if (!object(raw) || raw.operationId !== draft.id || raw.kind !== draft.kind) return uncertain();
  if (raw.outcome === "rejected" && typeof raw.error === "string" && raw.error) return { outcome: "rejected", error: raw.error };
  if (raw.outcome !== "applied") return uncertain();
  let request: Record<string, unknown>;
  try { request = JSON.parse(draft.body); } catch { return uncertain(); }
  if (request.operationId !== draft.id || request.kind !== draft.kind) return uncertain();
  if (draft.kind === "state") {
    const state = raw.state, c = request.change;
    if (!object(state) || !object(c) || !revision(state.revision) || !Array.isArray(state.unavailable) || state.unavailable.some(id => typeof id !== "string") || ![0,15,30].includes(state.busyMinutes as number) || !(state.pausedUntil === null || Number.isSafeInteger(state.pausedUntil))) return uncertain();
    if (typeof c.itemId === "string" && state.unavailable.includes(c.itemId) !== c.unavailable) return uncertain();
    if (c.busyMinutes !== undefined && c.busyMinutes !== state.busyMinutes) return uncertain();
    if (c.pauseMinutes === 0 && state.pausedUntil !== null) return uncertain();
    return { outcome: "applied" };
  }
  const order = raw.order;
  if (!object(order) || order.id !== request.orderId || order.status !== request.status || !revision(order.revision) || !Number.isSafeInteger(order.number) || Number(order.number) < 1 || typeof order.guestPhone !== "string" || typeof order.paid !== "boolean") return uncertain();
  return { outcome: "applied", order: order as KitchenResult["order"] };
}

/** One bounded request. The caller freezes controls and keeps the same draft
 * until a correlated durable receipt is returned; no automatic retry. */
export async function requestKitchen(draft: KitchenDraft, action: "submit" | "check", request: typeof fetch = fetch, timeoutMs = 12000): Promise<KitchenResult> {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await request(action === "check" ? "/api/kitchen/operation?id=" + encodeURIComponent(draft.id) : "/api/kitchen/" + (draft.kind === "state" ? "state" : "orders"), action === "check"
      ? { cache: "no-store", signal: controller.signal }
      : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: draft.body, signal: controller.signal });
    if (response.status === 401) return { outcome: "unknown", error: "Sign in again, then check this action's result." };
    if (response.status >= 500) return uncertain();
    return readKitchenResult(await response.json(), draft);
  } catch { return uncertain(); }
  finally { clearTimeout(timeout); }
}
