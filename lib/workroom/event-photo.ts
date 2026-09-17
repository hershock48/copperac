import { createHash } from "node:crypto";
import sharp from "sharp";

/** Decode and normalize an event flyer; identical output has an immutable ID. */
export async function prepareEventPhoto(dataUrl: unknown): Promise<{ id: string; contentType: "image/jpeg"; base64: string }> {
  if (typeof dataUrl !== "string" || dataUrl.length > 2_600_100) throw new Error("Use a JPEG, PNG or WebP photo under 2 MB after resizing.");
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match || match[2].length > 2_600_000) throw new Error("Use a JPEG, PNG or WebP photo.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.toString("base64") !== match[2]) throw new Error("The photo data is incomplete. Choose the file again.");
  const input = sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" });
  const metadata = await input.metadata();
  if (metadata.format !== match[1] || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) throw new Error("Use a single JPEG, PNG or WebP photo.");
  const normalized = await input.rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return { id: "img_" + createHash("sha256").update(normalized).digest("hex"), contentType: "image/jpeg", base64: normalized.toString("base64") };
}
