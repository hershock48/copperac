// Pricing and validation of one order line's option picks. Pure on purpose:
// the order API and the guest cart both call it, so the price the guest sees
// and the price the server charges come from one function, and it runs
// outside Next for the test in lib/__tests__/ordering-pricing.mjs.
//
// A pick is group-qualified on the wire, { group, choice }, never a bare
// choice name. Toast's menu reuses names across groups on the same item:
// Nachos sells "5 oz. Queso" in both "Nachos Options" and "Additional
// Sauces", and a Single Loose Burger's "Add Pickles" is 50 cents in one group
// and free in another. A bare name cannot say which price applies. The first
// version of this code matched names across every group, so one queso was
// charged twice and a legitimate pair of sauces was rejected as malformed
// because both names also lived in a single-pick group. The group name is
// the disambiguator the menu already has, so it travels with the pick.

import type { OrderableItem } from "./menu";

export type OptionPick = { group: string; choice: string };

export type PricedOptions =
  | { ok: true; optionCents: number; labels: string[] }
  | { ok: false; error: string };

const MALFORMED = "Malformed options.";

// The wire shape, checked field by field because a request body is guest
// input even when our own page wrote it. Returns null for anything that is
// not a list of { group, choice } pairs. A bare string in the list means a
// page from before this format was still open; the route names that case.
export function parsePicks(raw: unknown): OptionPick[] | "stale" | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const picks: OptionPick[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") return "stale";
    if (typeof entry !== "object" || entry === null) return null;
    const { group, choice } = entry as Record<string, unknown>;
    if (typeof group !== "string" || typeof choice !== "string") return null;
    picks.push({ group, choice });
  }
  return picks;
}

export function priceOptions(item: OrderableItem, picks: OptionPick[]): PricedOptions {
  const groups = new Map(item.options.map((g) => [g.name, g]));

  // A pick naming a group or choice this item does not have is rejected
  // outright: silence here would misprice quietly.
  for (const pick of picks) {
    const group = groups.get(pick.group);
    if (!group || !group.choices.some((c) => c.name === pick.choice)) {
      return { ok: false, error: MALFORMED };
    }
  }

  // Ticket labels carry the group name only where the choice name is
  // ambiguous on this item, so the kitchen reads "Additional Sauces: 5 oz.
  // Queso" next to "Nachos Options: 5 oz. Queso" instead of the same words
  // twice.
  const nameCount = new Map<string, number>();
  for (const group of item.options) {
    for (const name of new Set(group.choices.map((c) => c.name))) {
      nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
    }
  }

  let optionCents = 0;
  const labels: string[] = [];
  for (const group of item.options) {
    const names = picks.filter((p) => p.group === group.name).map((p) => p.choice);
    if (new Set(names).size !== names.length) return { ok: false, error: MALFORMED };
    const inGroup = group.choices.filter((c) => names.includes(c.name));
    if (group.multi) {
      // Any number; required multi means at least one.
      if (group.required && inGroup.length === 0) {
        return { ok: false, error: `${item.name} needs at least one ${group.name.toLowerCase()}.` };
      }
    } else {
      if (group.required && inGroup.length !== 1) {
        return { ok: false, error: `${item.name} needs a ${group.name.toLowerCase()} picked.` };
      }
      if (!group.required && inGroup.length > 1) return { ok: false, error: MALFORMED };
    }
    optionCents += inGroup.reduce((sum, c) => sum + c.priceCents, 0);
    for (const c of inGroup) {
      labels.push((nameCount.get(c.name) ?? 0) > 1 ? `${group.name}: ${c.name}` : c.name);
    }
  }
  return { ok: true, optionCents, labels };
}
