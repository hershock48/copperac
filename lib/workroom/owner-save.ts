/** Client-owned save contract. No automatic retries: a lost response may follow a committed write. */
export type OwnerSaveResult<T> =
  | { kind: "saved"; data: T; message: string }
  | { kind: "invalid" | "locked" | "conflict" | "uncertain"; message: string; errors?: Record<string, string> };

export const uncertainMessage = "The save could not be confirmed. Your typing is still here. Check the latest menu in another tab before trying again.";

export async function saveOwnerDraft<T>(url: string, body: unknown, valid: (value: unknown) => value is T, request: typeof fetch = fetch, timeoutMs = 15000): Promise<OwnerSaveResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await request(url, { method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const data: unknown = await response.json().catch(() => null);
    if (response.ok) {
      if (!valid(data)) return { kind: "uncertain", message: uncertainMessage };
      return { kind: "saved", data, message: "Saved. Check the public menu to confirm how it looks." };
    }
    if (response.status === 401 || response.status === 403) return { kind: "locked", message: "Sign in again in another tab, then check the latest menu before saving. Your typing is still here." };
    if (response.status === 409) return { kind: "conflict", message: "The menu changed in another window. Compare the latest menu in another tab before saving. Your typing is still here." };
    if (response.status === 400 || response.status === 422) {
      const raw = data && typeof data === "object" ? (data as { errors?: unknown }).errors : null;
      const errors: Record<string, string> = Object.create(null);
      if (raw && typeof raw === "object" && !Array.isArray(raw)) for (const [key, value] of Object.entries(raw)) if (typeof value === "string") errors[key] = value.slice(0, 300);
      return { kind: "invalid", errors, message: Object.keys(errors).length ? "Check the marked prices. Your typing is still here." : "The menu was not accepted. Check your entries; your typing is still here." };
    }
    return { kind: "uncertain", message: uncertainMessage };
  } catch {
    return { kind: "uncertain", message: uncertainMessage };
  } finally {
    clearTimeout(timer);
  }
}

/** Check the entire response shape before an editor replaces its local draft. */
export function isMenuSaveState(value: unknown, expectedKeys?: readonly string[]): boolean {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  if (state.ok !== true || !["memory", "postgres"].includes(String(state.backend)) || !Array.isArray(state.menus) || !state.menus.length) return false;
  const keys = new Set<string>();
  const valid = state.menus.every(menu => menu && typeof menu.id === "string" && typeof menu.label === "string" && Array.isArray(menu.sections) && menu.sections.every((section: Record<string, unknown>) => section && typeof section.name === "string" && Array.isArray(section.items) && section.items.every((item: Record<string, unknown>) => {
    if (!item || !["key", "name", "price", "desc", "builtInPrice", "builtInDesc"].every(key => typeof item[key] === "string") || typeof item.hidden !== "boolean" || typeof item.edited !== "boolean" || keys.has(item.key as string)) return false;
    keys.add(item.key as string); return true;
  })));
  return valid && (!expectedKeys || (keys.size === expectedKeys.length && expectedKeys.every(key => keys.has(key))));
}
