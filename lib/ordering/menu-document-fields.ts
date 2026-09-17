export type MenuDocItem = {
  id: string;
  name: string;
  desc: string;
  priceCents: number;
  image: string | null;
  hidden?: boolean;
  groups: { name: string; required: boolean; multi: boolean; choices: { name: string; priceCents: number }[] }[];
};
export type MenuDocSection = { name: string; ageRestricted: boolean; items: MenuDocItem[] };


export function validateMenuDoc(doc: unknown): string | null {
  if (!Array.isArray(doc) || doc.length === 0 || doc.length > 100) return "The menu cannot be empty.";
  const ids = new Set<string>();
  for (const s of doc as MenuDocSection[]) {
    if (typeof s?.name !== "string" || !s.name.trim() || s.name.length > 200) return "Every section needs a name.";
    if (typeof s.ageRestricted !== "boolean") return "Malformed section.";
    if (!Array.isArray(s.items) || s.items.length > 500) return "Malformed section.";
    for (const i of s.items) {
      if (typeof i?.id !== "string" || !i.id || i.id.length > 200) return "Malformed item id.";
      if (ids.has(i.id)) return `Duplicate item id: ${i.id}`;
      ids.add(i.id);
      if (ids.size > 2000) return "The menu has too many items.";
      if (i.hidden !== undefined && typeof i.hidden !== "boolean") return "Malformed visibility setting.";
      if (typeof i.name !== "string" || !i.name.trim() || i.name.length > 200) return "Every item needs a name.";
      if (!Number.isInteger(i.priceCents) || i.priceCents < 0 || i.priceCents > 1_000_00)
        return `Price out of range on ${i.name}.`;
      if (typeof i.desc !== "string" || i.desc.length > 4000) return "Malformed description.";
      if (i.image !== null && (typeof i.image !== "string" || i.image.length > 2048 || !/^(https?:\/\/|\/(?!\/))/.test(i.image))) return "Use a full HTTP(S) photo URL or a site image path.";
      if (!Array.isArray(i.groups) || i.groups.length > 40) return "Malformed options.";
      const groupNames = new Set<string>();
      for (const g of i.groups) {
        if (typeof g?.name !== "string" || !g.name.trim() || g.name.length > 200) return `An option group on ${i.name} needs a name.`;
        if (groupNames.has(g.name)) return `Duplicate option group on ${i.name}.`;
        groupNames.add(g.name);
        if (typeof g.required !== "boolean" || typeof g.multi !== "boolean") return "Malformed option group.";
        if (!Array.isArray(g.choices) || g.choices.length === 0 || g.choices.length > 100)
          return `Option group "${g.name}" on ${i.name} needs at least one choice.`;
        const choiceNames = new Set<string>();
        for (const c of g.choices) {
          if (typeof c?.name !== "string" || !c.name.trim() || c.name.length > 200) return `A choice in "${g.name}" needs a name.`;
          if (choiceNames.has(c.name)) return `Duplicate choice in "${g.name}".`;
          choiceNames.add(c.name);
          if (!Number.isInteger(c.priceCents) || c.priceCents < 0 || c.priceCents > 1_000_00)
            return `Choice price out of range in "${g.name}".`;
        }
      }
    }
  }
  return null;
}

export type MenuDraftItem = Omit<MenuDocItem, "priceCents" | "groups"> & { priceCents: string; groups: (Omit<MenuDocItem["groups"][number], "choices"> & { choices: { name: string; priceCents: string }[] })[] };
export type MenuDraftSection = Omit<MenuDocSection, "items"> & { items: MenuDraftItem[] };
export const moneyText = (cents: number): string => (cents / 100).toFixed(2);
export const toMenuDraft = (doc: MenuDocSection[]): MenuDraftSection[] => doc.map(s => ({ ...s, items: s.items.map(i => ({ ...i, priceCents: moneyText(i.priceCents), groups: i.groups.map(g => ({ ...g, choices: g.choices.map(c => ({ ...c, priceCents: moneyText(c.priceCents) })) })) })) }));
export function parseMenuPrice(value: string): number | null {
  const text=value.trim(); if (!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole,fraction=""]=text.split("."), cents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
  return cents <= 100000 ? cents : null;
}
export function prepareMenuDraft(draft: MenuDraftSection[]): { doc: MenuDocSection[]; error?: never } | { error: string; doc?: never } {
  for(const s of draft)for(const i of s.items){
    if(parseMenuPrice(i.priceCents)===null)return {error:'Enter a price from 0 to 1000 with at most two decimal places for '+(i.name || 'the unnamed item')+'.'};
    for(const g of i.groups)for(const c of g.choices)if(parseMenuPrice(c.priceCents)===null)return {error:'Check the choice price for '+(c.name || 'the unnamed choice')+'. Use at most two decimal places.'};
  }
  const doc: MenuDocSection[]=draft.map(s=>({...s,items:s.items.map(i=>({...i,priceCents:parseMenuPrice(i.priceCents)!,groups:i.groups.map(g=>({...g,choices:g.choices.map(c=>({...c,priceCents:parseMenuPrice(c.priceCents)!}))}))}))}));
  const error=validateMenuDoc(doc);return error?{error}:{doc};
}
export type MenuSnapshot={ok:true;doc:MenuDocSection[];revision:string;backend:"memory"|"postgres";history:{id:string;changedAt:string}[]};
export function isMenuSnapshot(value: unknown): value is MenuSnapshot {
  if(!value || typeof value!=="object")return false;
  const v=value as Record<string,unknown>;
  return v.ok===true && typeof v.revision==="string" && /^[a-f0-9]{64}$/.test(v.revision) && ["memory","postgres"].includes(String(v.backend)) && validateMenuDoc(v.doc)===null && Array.isArray(v.history) && v.history.every(h=>h && typeof h.id==="string" && typeof h.changedAt==="string" && Number.isFinite(Date.parse(h.changedAt)));
}

export type OrderOption = {
  name: string;
  required: boolean;
  multi?: boolean;
  choices: { name: string; priceCents: number }[];
};

export type OrderableItem = {
  id: string;
  section: string;
  name: string;
  desc: string;
  priceCents: number;
  options: OrderOption[];
  ageRestricted: boolean;
  image?: string;
};
export type OrderableSection = { name: string; items: OrderableItem[]; ageRestricted: boolean };

export function toOrderable(doc: MenuDocSection[], opts: { includeHidden: boolean }): OrderableSection[] {
  return doc
    .map((s) => ({
      name: s.name,
      ageRestricted: s.ageRestricted,
      items: s.items
        .filter((i) => opts.includeHidden || !i.hidden)
        .map((i) => ({
          id: i.id,
          section: s.name,
          name: i.name,
          desc: i.desc,
          priceCents: i.priceCents,
          options: i.groups.map((g) => ({
            name: g.name,
            required: g.required,
            multi: g.multi,
            choices: g.choices,
          })),
          ageRestricted: s.ageRestricted,
          image: i.image ?? undefined,
        })),
    }))
    .filter((s) => s.items.length > 0 || opts.includeHidden);
}


export const menuDocumentJSON=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v && typeof v==="object" && !Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
