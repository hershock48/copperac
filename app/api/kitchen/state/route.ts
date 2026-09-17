import { isKitchenAuthed } from "@/lib/ordering/auth";
import { getStore } from "@/lib/ordering/store";
import { boardView } from "@/lib/ordering/kitchen-operations";
import { kitchenReply, runKitchenAction } from "@/lib/ordering/kitchen-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isKitchenAuthed())) return kitchenReply({ error: "Not signed in." }, 401);
  try {
    const store = getStore(), state = boardView(await store.getStateRecord());
    const { configuredPrinters } = await import("@/lib/ordering/printing");
    const printing = await store.printStatus();
    const printers = configuredPrinters().map(p => { const device=printing.devices.find(d=>d.id===p.id);return {id:p.id,label:p.label,role:p.role,online:Date.now()-(device?.lastSeen??0)<60_000,reportedStatus:device?.reportedStatus??null}; });
    return kitchenReply({ state, backend: store.backend, printers, printIssues:printing.issues, printIssueCount:printing.issueCount });
  } catch { return kitchenReply({ error: "Kitchen state is unavailable. Try refreshing." }, 503); }
}
export async function PATCH(req: Request) { return runKitchenAction(req, "state"); }
