"use client";
import { useEffect, useRef, useState } from "react";
import { saveOwnerDraft } from "@/lib/workroom/owner-save";
import { isMenuSnapshot, toMenuDraft, prepareMenuDraft, menuDocumentJSON, type MenuDocSection, type MenuDraftItem, type MenuDraftSection, type MenuSnapshot } from "@/lib/ordering/menu-document-fields";
function slug(s:string):string{return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}
const inputCls="w-full rounded-sm border border-ink-line bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-copper-light";
const smallBtn="rounded-sm border border-ink-line px-3 py-2 text-xs text-cream-dim transition-colors hover:border-copper-light";
export default function MenuEditor({onSaved}:{onSaved:(doc:MenuDocSection[])=>void}){
 const [doc,setDoc]=useState<MenuDraftSection[]|null>(null),[snapshot,setSnapshot]=useState<MenuSnapshot|null>(null);
 const [dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[savedFlash,setSavedFlash]=useState(false),[error,setError]=useState("");
 const [latest,setLatest]=useState<MenuSnapshot|null>(null),[checking,setChecking]=useState(false),[replaceArmed,setReplaceArmed]=useState(false);
 const [openItem,setOpenItem]=useState<string|null>(null),[armDelete,setArmDelete]=useState<string|null>(null);
 const pending=useRef(false),mounted=useRef(true);
 useEffect(()=>{
  mounted.current=true;let active=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  fetch("/api/kitchen/menu",{cache:"no-store",signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();const data:unknown=await r.json();if(!isMenuSnapshot(data))throw Error();if(active){setDoc(toMenuDraft(data.doc));setSnapshot(data);onSaved(data.doc);}}).catch(()=>{if(active)setError("Could not load the saved menu. Check owner sign-in and try again in another tab.");}).finally(()=>clearTimeout(timer));
  return()=>{active=false;mounted.current=false;clearTimeout(timer);controller.abort();};
 },[onSaved]);
 useEffect(()=>{if(!dirty)return;const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();};window.addEventListener("beforeunload",protect);return()=>window.removeEventListener("beforeunload",protect);},[dirty]);
 function mutate(fn:(d:MenuDraftSection[])=>void){if(pending.current)return;setDoc(d=>{if(!d)return d;const copy=structuredClone(d);fn(copy);return copy;});setDirty(true);setSavedFlash(false);setReplaceArmed(false);}
 async function save(){
  if(!doc || !snapshot || pending.current)return;
  const planned=prepareMenuDraft(doc);if(planned.error){setError(planned.error);return;}const submitted=planned.doc!;
  pending.current=true;setSaving(true);setError("");setSavedFlash(false);
  const result=await saveOwnerDraft("/api/kitchen/menu",{doc:submitted,revision:snapshot.revision},(value):value is MenuSnapshot=>isMenuSnapshot(value) && value.revision!==snapshot.revision && menuDocumentJSON(value.doc)===menuDocumentJSON(submitted));
  if(mounted.current){
   if(result.kind==="saved"){setSnapshot(result.data);setDirty(false);setSavedFlash(true);setLatest(null);onSaved(result.data.doc);}
   else setError(result.kind === "conflict" ? "The saved menu changed. Use Compare latest saved menu; your draft is still here." : result.kind === "uncertain" ? "This save could not be confirmed. Use Compare latest saved menu before retrying; your draft is still here." : result.message);
   setSaving(false);
  }
  pending.current=false;
 }
 async function compareLatest(){
  if(pending.current)return;pending.current=true;setChecking(true);setError("");
  try{const response=await fetch("/api/kitchen/menu",{cache:"no-store",signal:AbortSignal.timeout(12000)});const data:unknown=await response.json();if(!response.ok || !isMenuSnapshot(data))throw Error();if(mounted.current){setLatest(data);setReplaceArmed(false);}}
  catch{if(mounted.current)setError("Could not check the latest saved menu. Your draft is still here.");}
  finally{pending.current=false;if(mounted.current)setChecking(false);}
 }
 function downloadDraft(){if(!doc)return;const url=URL.createObjectURL(new Blob([JSON.stringify({savedRevision:snapshot?.revision,pricesInDollars:true,draft:doc},null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download="copper-demo-menu-draft.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function useLatest(){if(!latest || pending.current)return;if(dirty && !replaceArmed){setReplaceArmed(true);return;}setDoc(toMenuDraft(latest.doc));setSnapshot(latest);onSaved(latest.doc);setDirty(false);setError("");setSavedFlash(false);setLatest(null);setReplaceArmed(false);setOpenItem(null);setArmDelete(null);}
 if(!doc)return <p role={error?"alert":undefined} className="py-10 text-sm text-cream-dim">{error || "Loading the saved menu…"}</p>;
 return (<div>
  <p className="mb-4 text-sm text-cream-dim">This edits the parked demo menu. Copper’s customers order through Toast; this does not update Toast. Drafts stay here when you switch kitchen tabs. Download your draft before reloading or signing out.</p>
  <div className="sticky top-0 z-30 mb-4 flex flex-wrap items-center gap-3 border-b border-ink-line bg-ink/95 py-3 backdrop-blur">
   <button type="button" onClick={save} disabled={!dirty || saving || checking} className="display rounded-sm bg-copper px-6 py-3 text-sm uppercase tracking-widest text-ink disabled:opacity-40">{saving?"Saving…":"Save menu"}</button>
   <button type="button" onClick={compareLatest} disabled={saving || checking} className={smallBtn}>{checking?"Checking…":"Compare latest saved menu"}</button>
   <button type="button" onClick={downloadDraft} className={smallBtn}>Download draft</button>
   {dirty && <span className="text-sm text-copper-light">Unsaved changes</span>}
   {savedFlash && !dirty && <span role="status" className="text-sm text-[#7dd18a]">Saved to the demo menu. Check the demo order page; cached pages may take a few seconds.</span>}
   {error && <p role="alert" className="w-full text-sm text-[#d9736b]">{error}</p>}
  </div>
  <p className="mb-4 text-sm"><a href="/order" target="_blank" rel="noreferrer" className="underline">View demo order page</a> · <a href="/workroom" target="_blank" rel="noreferrer" className="underline">Owner sign-in</a></p>
  {latest && <section aria-label="Latest saved menu" className="mb-6 rounded-sm border border-copper p-4 text-sm text-cream">
   <h2 className="mb-2 font-semibold">Latest saved menu</h2><p>Your draft remains in the editor below. Compare prices, visibility and options before replacing it.</p>
   <details className="my-3"><summary>Read saved items and options</summary>{latest.doc.map((s,index)=><div key={index} className="my-3"><h3>{s.name}{s.ageRestricted?" · 21+":""}</h3>{s.items.map(i=><div key={i.id} className="my-2 border-t border-ink-line pt-2"><p>{i.name} · ${(i.priceCents/100).toFixed(2)}{i.hidden?" · Hidden":""}</p><p>{i.desc}</p>{i.image && <p className="break-all">Photo: {i.image}</p>}{i.groups.map((g,gi)=><p key={gi}>{g.name} · {g.required?"Required":"Optional"} · {g.multi?"Pick many":"Pick one"}: {g.choices.map(c=>c.name+" +$"+(c.priceCents/100).toFixed(2)).join(", ")}</p>)}</div>)}</div>)}</details>
   <button type="button" disabled={saving || checking} onClick={useLatest} className={smallBtn}>{replaceArmed?"Replace my draft with this saved copy":"Use latest saved menu"}</button>
   {replaceArmed && <p className="mt-2 text-copper-light">This replaces your unsaved edits. Download the draft first if you want to keep it.</p>}
  </section>}
  <details className="mb-5 text-sm text-cream-dim"><summary>Recent menu saves</summary>{snapshot?.history.length?<ul>{snapshot.history.map(h=><li key={h.id}>Owner save · {new Date(h.changedAt).toLocaleString("en-US",{timeZone:"America/Detroit"})} Eastern</li>)}</ul>:<p>No owner saves recorded yet.</p>}<p>Before and after copies are retained privately. Restoring history requires a reviewed change.</p></details>
  <fieldset disabled={saving || checking} className="min-w-0" aria-label="Demo menu fields">
      {doc.map((section, si) => (
        <section key={si} className="mb-8 rounded-sm border border-ink-line bg-ink-soft p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <input
              value={section.name}
              onChange={(e) => mutate((d) => { d[si].name = e.target.value; })}
              aria-label="Section name"
              className="display max-w-xs rounded-sm border border-transparent bg-transparent px-2 py-1 text-base uppercase tracking-widest text-copper-light outline-none focus:border-copper-light"
            />
            <label className="flex items-center gap-2 text-xs text-cream-dim">
              <input
                type="checkbox"
                checked={section.ageRestricted}
                onChange={(e) => mutate((d) => { d[si].ageRestricted = e.target.checked; })}
                className="h-3.5 w-3.5 accent-[#b86d2a]"
              />
              21+ section
            </label>
            <button
              type="button"
              className={smallBtn}
              onClick={() =>
                mutate((d) => {
                  const name = "New item";
                  d[si].items.unshift({
                    id: `${slug(section.name)}-${slug(name)}-${Math.random().toString(36).slice(2, 7)}`,
                    name,
                    desc: "",
                    priceCents: "0.00",
                    image: null,
                    groups: [],
                  });
                })
              }
            >
              + Add item
            </button>
            {section.items.length === 0 && (
              <button type="button" className={smallBtn} onClick={() => mutate((d) => { d.splice(si, 1); })}>
                Delete empty section
              </button>
            )}
          </div>

          <ul className="divide-y divide-ink-line">
            {section.items.map((item, ii) => (
              <ItemRow
                key={item.id}
                item={item}
                open={openItem === item.id}
                armDelete={armDelete === item.id}
                onToggle={() => setOpenItem(openItem === item.id ? null : item.id)}
                onDelete={() =>
                  armDelete === item.id
                    ? (mutate((d) => { d[si].items.splice(ii, 1); }), setArmDelete(null))
                    : setArmDelete(item.id)
                }
                onChange={(fn) => mutate((d) => fn(d[si].items[ii]))}
              />
            ))}
          </ul>
        </section>
      ))}

      <button
        type="button"
        className={smallBtn}
        onClick={() => mutate((d) => { d.push({ name: "New section", ageRestricted: false, items: [] }); })}
      >
        + Add section
      </button>
    </fieldset>
    </div>
  );
}

function ItemRow({
  item,
  open,
  armDelete,
  onToggle,
  onDelete,
  onChange,
}: {
  item: MenuDraftItem;
  open: boolean;
  armDelete: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onChange: (fn: (i: MenuDraftItem) => void) => void;
}) {
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className={`text-sm ${item.hidden ? "text-cream-dim/50 line-through" : "text-cream"}`}>
            {item.name || "(unnamed)"}
          </span>
          {item.hidden && (
            <span className="display ml-2 text-[10px] uppercase tracking-widest text-cream-dim/60">hidden</span>
          )}
        </button>
        <span className="text-sm text-cream-dim tabular-nums">${item.priceCents || ""}</span>
        <button type="button" onClick={onToggle} className={smallBtn}>
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 rounded-sm border border-ink-line bg-ink p-4">
          <div className="flex flex-wrap gap-3">
            <label className="flex-1 text-xs text-cream-dim">
              Name
              <input value={item.name} onChange={(e) => onChange((i) => { i.name = e.target.value; })} className={`mt-1 ${inputCls}`} />
            </label>
            <label className="w-28 text-xs text-cream-dim">
              Price $
              <input
                inputMode="decimal"
                value={item.priceCents}
                onChange={(e) => onChange((i) => { i.priceCents = e.target.value; })}
                className={`mt-1 ${inputCls} tabular-nums`}
              />
            </label>
          </div>
          <label className="block text-xs text-cream-dim">
            Description
            <textarea
              value={item.desc}
              onChange={(e) => onChange((i) => { i.desc = e.target.value; })}
              rows={2}
              className={`mt-1 ${inputCls} leading-relaxed`}
            />
          </label>
          <label className="block text-xs text-cream-dim">
            Photo URL <span className="text-cream-dim/60">(blank for no photo; direct upload is coming)</span>
            <input
              value={item.image ?? ""}
              onChange={(e) => onChange((i) => { i.image = e.target.value.trim() || null; })}
              className={`mt-1 ${inputCls}`}
            />
          </label>

          <OptionGroups item={item} onChange={onChange} />

          <div className="flex flex-wrap items-center gap-3 border-t border-ink-line pt-3">
            <label className="flex items-center gap-2 text-xs text-cream-dim">
              <input
                type="checkbox"
                checked={item.hidden ?? false}
                onChange={(e) => onChange((i) => { i.hidden = e.target.checked || undefined; })}
                className="h-3.5 w-3.5 accent-[#b86d2a]"
              />
              Hidden from the order page (seasonal or discontinued; tonight-only is the 86 board)
            </label>
            <button
              type="button"
              onClick={onDelete}
              className={`ml-auto rounded-sm border px-3 py-1.5 text-xs transition-colors ${
                armDelete ? "border-[#d9736b] bg-[#d9736b] text-ink" : "border-ink-line text-cream-dim/70 hover:border-[#d9736b] hover:text-[#d9736b]"
              }`}
            >
              {armDelete ? "Confirm delete" : "Delete item"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function OptionGroups({
  item,
  onChange,
}: {
  item: MenuDraftItem;
  onChange: (fn: (i: MenuDraftItem) => void) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="display text-[10px] uppercase tracking-widest text-copper-light">Options</p>
      {item.groups.map((group, gi) => (
        <div key={gi} className="rounded-sm border border-ink-line p-3">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <input
              value={group.name}
              onChange={(e) => onChange((i) => { i.groups[gi].name = e.target.value; })}
              aria-label="Option group name"
              className={`max-w-[14rem] ${inputCls}`}
            />
            <label className="flex items-center gap-1.5 text-xs text-cream-dim">
              <input
                type="checkbox"
                checked={group.required}
                onChange={(e) => onChange((i) => { i.groups[gi].required = e.target.checked; })}
                className="h-3.5 w-3.5 accent-[#b86d2a]"
              />
              required
            </label>
            <label className="flex items-center gap-1.5 text-xs text-cream-dim">
              <input
                type="checkbox"
                checked={group.multi}
                onChange={(e) => onChange((i) => { i.groups[gi].multi = e.target.checked; })}
                className="h-3.5 w-3.5 accent-[#b86d2a]"
              />
              pick many
            </label>
            <button
              type="button"
              className={`ml-auto ${smallBtn}`}
              onClick={() => onChange((i) => { i.groups.splice(gi, 1); })}
            >
              Remove group
            </button>
          </div>
          {group.choices.map((choice, ci) => (
            <div key={ci} className="mb-1.5 flex items-center gap-2">
              <input
                value={choice.name}
                onChange={(e) => onChange((i) => { i.groups[gi].choices[ci].name = e.target.value; })}
                aria-label="Choice name"
                className={`flex-1 ${inputCls}`}
              />
              <span className="text-xs text-cream-dim">+$</span>
              <input
                inputMode="decimal"
                value={choice.priceCents}
                onChange={(e) => onChange((i) => { i.groups[gi].choices[ci].priceCents = e.target.value; })}
                aria-label="Choice price"
                className={`w-20 ${inputCls} tabular-nums`}
              />
              <button
                type="button"
                aria-label="Remove choice"
                className={smallBtn}
                onClick={() => onChange((i) => { i.groups[gi].choices.splice(ci, 1); })}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className={smallBtn}
            onClick={() => onChange((i) => { i.groups[gi].choices.push({ name: "", priceCents: "0.00" }); })}
          >
            + Choice
          </button>
        </div>
      ))}
      <button
        type="button"
        className={smallBtn}
        onClick={() =>
          onChange((i) => {
            i.groups.push({ name: "New options", required: false, multi: true, choices: [{ name: "", priceCents: "0.00" }] });
          })
        }
      >
        + Option group
      </button>
    </div>
  );
}
