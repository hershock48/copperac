import { isKitchenAuthed } from "@/lib/ordering/auth";
import { getStore } from "@/lib/ordering/store";
import { orderView } from "@/lib/ordering/kitchen-operations";
import { kitchenReply, runKitchenAction } from "@/lib/ordering/kitchen-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isKitchenAuthed())) return kitchenReply({ error: "Not signed in." }, 401);
  try {
    const store = getStore(), orders = (await store.listActiveOrders()).map(orderView);
    return kitchenReply({ orders, backend: store.backend });
  } catch { return kitchenReply({ error: "Orders could not be checked. Try refreshing." }, 503); }
}
export async function PATCH(req: Request) { return runKitchenAction(req, "order"); }
