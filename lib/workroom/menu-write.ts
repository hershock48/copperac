export type MenuOverrides = Record<string, { price?: string; desc?: string; hidden?: boolean }>;
export type EditableMenuSnapshot = { revision: string; menus: { sections: { items: { key: string; builtInPrice: string; builtInDesc: string }[] }[] }[] };
export type PriceRules = { normalizePrice(value: string): string; priceError(value: string): string | null };
type Plan = { ok: true; overrides: MenuOverrides } | { ok: false; status: number; error: string; errors?: Record<string, string> };
export function prepareMenuSave(state: EditableMenuSnapshot, body: unknown, { normalizePrice, priceError }: PriceRules): Plan {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, error: "Malformed menu." };
  const input = body as Record<string, unknown>;
  if (typeof input.revision !== "string" || input.revision !== state.revision) return { ok: false, status: 409, error: "This menu changed. Compare the latest copy before saving." };
  if (!input.items || typeof input.items !== "object" || Array.isArray(input.items)) return { ok: false, status: 400, error: "A complete menu is required." };
  const items = input.items as Record<string, unknown>;
  const builtIn = new Map(state.menus.flatMap(m => m.sections.flatMap(s => s.items.map(i => [i.key, i] as const))));
  if (Object.keys(items).length !== builtIn.size || Object.keys(items).some(key => !builtIn.has(key))) return { ok: false, status: 400, error: "The submitted menu is incomplete or contains unknown items." };
  const overrides: MenuOverrides = Object.create(null), errors: Record<string, string> = Object.create(null);
  for (const [key, base] of builtIn) {
    const raw = items[key];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, status: 400, error: "Invalid menu item." };
    const r = raw as Record<string, unknown>;
    if (typeof r.price !== "string" || typeof r.desc !== "string" || typeof r.hidden !== "boolean" || r.desc.length > Math.max(400, base.builtInDesc.length)) return { ok: false, status: 400, error: "Each item needs a price, description within its supported length, and visibility setting." };
    const price = r.price.trim().replace(/^\$/, ""), error = priceError(price);
    if (error) { errors[key] = error; continue; }
    const normalized = price === "" ? base.builtInPrice : normalizePrice(price);
    const desc = r.desc.replace(/[\r\n]+/g, " ").trim();
    const override: MenuOverrides[string] = {};
    if (normalized !== base.builtInPrice) override.price = normalized;
    if (desc !== base.builtInDesc) override.desc = desc;
    if (r.hidden) override.hidden = true;
    if (Object.keys(override).length) overrides[key] = override;
  }
  return Object.keys(errors).length ? { ok: false, status: 400, error: "Check the marked prices.", errors } : { ok: true, overrides };
}
