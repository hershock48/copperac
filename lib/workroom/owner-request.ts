export type OwnerResult<T> =
  | { kind: "saved"; data: T }
  | { kind: "invalid" | "locked" | "conflict" | "uncertain"; message: string; errors?: Record<string, string> };

export async function ownerRequest<T>(url: string, method: "POST" | "PUT" | "DELETE", body: unknown,
  valid: (value: unknown) => value is T, request: typeof fetch = fetch, timeoutMs = 15000): Promise<OwnerResult<T>> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  const uncertain = { kind: "uncertain" as const, message: "The change could not be confirmed. Your draft is still here. Check the latest saved copy before trying again." };
  try {
    const response = await request(url, { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const data: unknown = await response.json().catch(() => null);
    if (response.ok) return data && typeof data === "object" && (data as { ok?: unknown }).ok === true && valid(data) ? { kind: "saved", data } : uncertain;
    if (response.status === 401 || response.status === 403) return { kind: "locked", message: "Sign in again in another tab. Your draft is still here; compare the latest saved copy before saving." };
    if (response.status === 409 || response.status === 404) return { kind: "conflict", message: "The saved copy changed or is no longer available. Your draft is still here. Open the latest copy in another tab to compare." };
    if ([400, 413, 422].includes(response.status)) {
      const raw = data && typeof data === "object" ? data as { error?: unknown; errors?: unknown } : {};
      const errors: Record<string, string> = Object.create(null);
      if (raw.errors && typeof raw.errors === "object" && !Array.isArray(raw.errors)) for (const [key, value] of Object.entries(raw.errors)) if (typeof value === "string") errors[key] = value.slice(0, 300);
      return { kind: "invalid", message: typeof raw.error === "string" ? raw.error.slice(0, 500) : "Check your entries. Your draft is still here.", errors };
    }
    return uncertain;
  } catch { return uncertain; }
  finally { clearTimeout(timer); }
}
