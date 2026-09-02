import { getStore } from "@/lib/workroom/store";

/**
 * An event photo, out of the workroom's store. Ids are minted per upload and
 * never reused, so the response is immutable and the CDN can keep it for a
 * year; a replaced photo gets a new id and a new URL.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^img_[a-z0-9]+$/.test(id)) return new Response("Not found", { status: 404 });
  const image = await getStore().images.get(id);
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(image.base64, "base64"), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
