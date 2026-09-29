/** Client-safe order arithmetic and validation. Options are priced by the client's reviewed resolver. */
export type QuotePick = { group: string; choice: string };
export type QuoteItem = { id: string; name: string; priceCents: number; ageRestricted: boolean; options: { name: string; required: boolean; multi?: boolean; choices: { name: string; priceCents: number }[] }[] };
export type QuoteLine = { itemId: string; name: string; qty: number; unitCents: number; lineCents: number; options: string[]; ageRestricted: boolean };
export type OrderTotals = { subtotalCents: number; feeCents: number; tipCents: number; taxCents: number; totalCents: number };
export type OrderQuote = { lines: QuoteLine[]; hasAlcohol: boolean; totals: OrderTotals; taxBasisPoints: number };
type Failed = { ok: false; error: string; status: 400 | 409 | 503 };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 300;
const totalKeys = ["subtotalCents", "feeCents", "tipCents", "taxCents", "totalCents"] as const;
const fail = (error: string, status: Failed["status"] = 400): Failed => ({ ok: false, error, status });

export function orderTotals(subtotalCents: number, feeCents: number, tipCents: number, taxBasisPoints: number): OrderTotals | null {
  if (![subtotalCents, feeCents, tipCents, taxBasisPoints].every(integer) || taxBasisPoints > 10000 || tipCents > subtotalCents * 2) return null;
  const taxable = BigInt(subtotalCents) + BigInt(feeCents);
  // Round non-negative tax to the nearest cent, with exact integer arithmetic.
  const tax = (taxable * BigInt(taxBasisPoints) + 5000n) / 10000n;
  const total = taxable + BigInt(tipCents) + tax;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { subtotalCents, feeCents, tipCents, taxCents: Number(tax), totalCents: Number(total) };
}
export function sameTotals(raw: unknown, totals: OrderTotals): boolean {
  return object(raw) && totalKeys.every(key => integer(raw[key]) && raw[key] === totals[key]);
}
function validItem(item: QuoteItem): boolean {
  if (!text(item.id) || !text(item.name) || !integer(item.priceCents) || typeof item.ageRestricted !== "boolean" || !Array.isArray(item.options) || item.options.length > 100) return false;
  const groups = new Set<string>();
  for (const group of item.options) {
    if (!group || !text(group.name) || groups.has(group.name) || typeof group.required !== "boolean" || (group.multi !== undefined && typeof group.multi !== "boolean") || !Array.isArray(group.choices) || group.choices.length === 0 || group.choices.length > 100) return false;
    groups.add(group.name); const choices = new Set<string>();
    for (const choice of group.choices) { if (!choice || !text(choice.name) || choices.has(choice.name) || !integer(choice.priceCents)) return false; choices.add(choice.name); }
  }
  return true;
}
/** Stable cart identity without collisions from commas, equals signs or option order. */
export function orderLineKey(itemId: string, picks: QuotePick[]): string {
  return JSON.stringify([itemId, picks.map(p => [p.group, p.choice]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
}
export function quoteOrder<T extends QuoteItem>(rawLines: unknown, index: Map<string, T>, unavailable: readonly string[], config: { feeCents: number; tipCents: unknown; taxBasisPoints: number }, resolveOptions: (item: T, picks: QuotePick[]) => { ok: true; optionCents: number; labels: string[] } | { ok: false; error: string }): { ok: true; quote: OrderQuote } | Failed {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return fail("The cart is empty.");
  if (rawLines.length > 30) return fail("For an order this large, call the bar.");
  if (!integer(config.feeCents) || !integer(config.taxBasisPoints) || config.taxBasisPoints > 10000) return fail("Ordering totals are unavailable. Please contact the bar.", 503);
  if (!integer(config.tipCents)) return fail("Use a whole number of cents for the tip.");
  const lines: QuoteLine[] = [], seen = new Set<string>(); let hasAlcohol = false;
  for (const raw of rawLines) {
    if (!object(raw) || !text(raw.itemId) || !integer(raw.qty) || raw.qty < 1 || raw.qty > 12) return fail("Choose a whole quantity from 1 to 12 for each item.");
    const item = index.get(raw.itemId); if (!item) return fail("An item is no longer on the menu. Remove it or refresh the menu.", 409);
    if (!validItem(item) || item.id !== raw.itemId) return fail("An item cannot be priced safely. Please contact the bar.", 503);
    if (unavailable.includes(item.id)) return fail(`${item.name} just sold out. Remove it from the cart.`, 409);
    const rawPicks = raw.options ?? [];
    if (!Array.isArray(rawPicks) || rawPicks.length > 100) return fail("Malformed options.");
    const picks: QuotePick[] = [];
    for (const pick of rawPicks) { if (!object(pick) || !text(pick.group) || !text(pick.choice)) return fail("This page has outdated or invalid options. Refresh the menu."); picks.push({ group: pick.group, choice: pick.choice }); }
    const key = orderLineKey(item.id, picks);
    if (seen.has(key)) return fail("Combine identical items into one cart line before ordering."); seen.add(key);
    const priced = resolveOptions(item, picks); if (!priced.ok) return fail(priced.error);
    if (!integer(priced.optionCents)) return fail("An option cannot be priced safely.", 503);
    const unitCents = item.priceCents + priced.optionCents, lineCents = unitCents * raw.qty;
    if (!integer(unitCents) || !integer(lineCents)) return fail("That order total is out of range.");
    lines.push({ itemId: item.id, name: item.name, qty: raw.qty, unitCents, lineCents, options: priced.labels, ageRestricted: item.ageRestricted });
    hasAlcohol ||= item.ageRestricted;
  }
  const subtotal = lines.reduce((sum, line) => sum + line.lineCents, 0);
  const totals = orderTotals(subtotal, config.feeCents, config.tipCents, config.taxBasisPoints);
  if (!totals) return fail("The tip or order total is out of range.");
  return { ok: true, quote: { lines, hasAlcohol, totals, taxBasisPoints: config.taxBasisPoints } };
}
/** Submitted amounts express what the guest reviewed, never what the server should charge. */
export function quoteWasReviewed(rawLines: unknown, expectedTotals: unknown, quote: OrderQuote): boolean {
  return Array.isArray(rawLines) && rawLines.length === quote.lines.length && rawLines.every((line, i) => object(line) && line.itemId === quote.lines[i].itemId && line.qty === quote.lines[i].qty && integer(line.quotedUnitCents) && line.quotedUnitCents === quote.lines[i].unitCents && line.quotedAgeRestricted === quote.lines[i].ageRestricted) && sameTotals(expectedTotals, quote.totals);
}
/** Validate a returned price-review payload before updating the guest's cart. */
export function isQuoteForSubmission(raw: unknown, submitted: { itemId: string; qty: number }[]): raw is OrderQuote {
  if (!object(raw) || !Array.isArray(raw.lines) || raw.lines.length !== submitted.length || typeof raw.hasAlcohol !== "boolean" || !integer(raw.taxBasisPoints) || !object(raw.totals)) return false;
  let subtotal = 0;
  for (let i = 0; i < raw.lines.length; i++) {
    const line = raw.lines[i];
    if (!object(line) || line.itemId !== submitted[i].itemId || line.qty !== submitted[i].qty || !integer(line.qty) || line.qty < 1 || line.qty > 12 || !text(line.name) || typeof line.ageRestricted !== "boolean" || !integer(line.unitCents) || !integer(line.lineCents) || line.lineCents !== line.unitCents * line.qty || !Array.isArray(line.options) || !line.options.every(value => typeof value === "string" && value.length > 0 && value.length <= 602) || line.options.length > 100) return false;
    subtotal += line.lineCents;
  }
  if (!totalKeys.every(key => integer((raw.totals as Record<string, unknown>)[key]))) return false;
  const totals = raw.totals as OrderTotals, calculated = orderTotals(subtotal, totals.feeCents, totals.tipCents, raw.taxBasisPoints);
  return Boolean(calculated && sameTotals(totals, calculated) && raw.hasAlcohol === raw.lines.some(line => line.ageRestricted));
}
