// The CloudPRNT endpoint: what the physical printers talk to.
//
// Star's protocol, three verbs from the printer's side:
//   POST   "I am alive; anything to print?"  -> { jobReady, mediaTypes }
//   GET    "give me the job"                 -> text/plain body
//   DELETE "here is how printing went"       -> we mark the job, and a
//          successful KITCHEN print auto-accepts the order: paper at the
//          pass IS the acceptance. No tablet tap needed on printer nights.
//
// Every request carries ?token=; tokens live in ORDERING_PRINTERS and are
// per-device, so one leaked URL revokes one printer, not the fleet. Every
// poll is recorded as a heartbeat; the kitchen board turns a printer's chip
// red after missed polls, which is the whole monitoring story: the server
// notices a dead printer before the kitchen does.
//
// Jobs older than the TTL are expired unfetched: a printer that was off for
// an hour must not print an hour of cold orders on reconnect.

import { NextRequest, NextResponse } from "next/server";
import { configuredPrinters } from "@/lib/ordering/printing";
import { getStore } from "@/lib/ordering/store";

export const dynamic = "force-dynamic";

const JOB_TTL_MS = 20 * 60 * 1000;

function printerFor(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  return configuredPrinters().find((p) => p.token === token) ?? null;
}

export async function POST(req: NextRequest) {
  const printer = printerFor(req);
  if (!printer) return NextResponse.json({ error: "unknown printer" }, { status: 401 });
  const store = getStore();
  await store.printerSeen(printer.id);
  const job = await store.nextPrintJob(printer.id, JOB_TTL_MS);
  return NextResponse.json({
    jobReady: job !== null,
    mediaTypes: job ? ["text/plain"] : undefined,
  });
}

export async function GET(req: NextRequest) {
  const printer = printerFor(req);
  if (!printer) return NextResponse.json({ error: "unknown printer" }, { status: 401 });
  const store = getStore();
  const job = await store.nextPrintJob(printer.id, JOB_TTL_MS);
  if (!job) return new NextResponse(null, { status: 404 });
  return new NextResponse(job.body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function DELETE(req: NextRequest) {
  const printer = printerFor(req);
  if (!printer) return NextResponse.json({ error: "unknown printer" }, { status: 401 });
  const store = getStore();
  const job = await store.nextPrintJob(printer.id, JOB_TTL_MS);
  if (!job) return NextResponse.json({ ok: true });

  // CloudPRNT reports the outcome as ?code=OK (or an error string).
  const code = (req.nextUrl.searchParams.get("code") ?? "OK").toUpperCase();
  const printed = code === "OK" || code === "200";
  await store.setPrintJobStatus(job.id, printed ? "printed" : "failed");

  if (printed && printer.role === "kitchen") {
    const order = await store.getOrder(job.orderId);
    if (order && order.status === "new") {
      await store.setOrderStatus(order.id, "accepted");
    }
  }
  return NextResponse.json({ ok: true });
}
