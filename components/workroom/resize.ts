/**
 * Downscale a photo in the browser before it is sent: a phone shot is 4MB
 * the server never needs. 1200px on the long side at JPEG 0.85 lands a flyer
 * around 150KB, which the events page renders at 400px wide anyway.
 * createImageBitmap honours the EXIF orientation where supported, so a
 * portrait flyer stays portrait; the fallback path draws the image as
 * decoded.
 */
export async function resizeToJpegDataUrl(file: File, maxSide = 1200): Promise<string> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap) bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to the element path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
