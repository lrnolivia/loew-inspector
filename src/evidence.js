const SAFE_REQUEST_ID = /^[a-zA-Z0-9._-]{1,80}$/;

function safeRequestId(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !SAFE_REQUEST_ID.test(value)) throw new Error("Invalid request_id");
  return value;
}

function datePrefix(now = new Date()) {
  const iso = now.toISOString();
  return iso.slice(0, 10).replaceAll("-", "/");
}

export function decodeBase64Bytes(value) {
  if (typeof value !== "string" || value.length === 0) throw new Error("Snapshot returned no screenshot");
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function countAccessibilityNodes(value) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countAccessibilityNodes(item), 0);
  if (!value || typeof value !== "object") return 0;
  return 1 + Object.values(value).reduce((sum, item) => sum + countAccessibilityNodes(item), 0);
}

export function summarizeSnapshot(result = {}) {
  const html = typeof result.content === "string" ? result.content : "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim().slice(0, 200) : "";
  const tagCount = (html.match(/<[a-z][^>]*>/gi) || []).length;
  return {
    title,
    dom: {
      html_bytes: new TextEncoder().encode(html).byteLength,
      element_tag_count: tagCount
    },
    accessibility: {
      node_count: countAccessibilityNodes(result.accessibilityTree ?? result.accessibility_tree ?? null),
      available: Boolean(result.accessibilityTree ?? result.accessibility_tree)
    }
  };
}

export async function storeEvidence(bucket, {
  requestId,
  targetUrl,
  kind,
  screenshotBytes,
  browserMs,
  viewport,
  selector = null,
  fullPage = false,
  durationMs,
  extra = {}
}) {
  if (!bucket || typeof bucket.put !== "function") throw new Error("Evidence R2 binding unavailable");
  if (!(screenshotBytes instanceof Uint8Array) || screenshotBytes.byteLength === 0) throw new Error("Screenshot evidence is empty");
  const capturedAt = new Date().toISOString();
  const id = `vis_${crypto.randomUUID()}`;
  const prefix = `visual/${datePrefix(new Date(capturedAt))}/${id}`;
  const screenshotKey = `${prefix}.png`;
  const metadataKey = `${prefix}.json`;
  const metadata = {
    ok: true,
    evidence_id: id,
    request_id: safeRequestId(requestId),
    kind,
    target_url: targetUrl,
    captured_at: capturedAt,
    viewport,
    selector,
    full_page: Boolean(fullPage),
    browser_ms: browserMs,
    duration_ms: durationMs,
    screenshot_key: screenshotKey,
    metadata_key: metadataKey,
    screenshot_bytes: screenshotBytes.byteLength,
    ...extra
  };
  await Promise.all([
    bucket.put(screenshotKey, screenshotBytes, {
      httpMetadata: { contentType: "image/png", cacheControl: "private, max-age=0, no-store" },
      customMetadata: { evidenceId: id, kind, capturedAt }
    }),
    bucket.put(metadataKey, JSON.stringify(metadata), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "private, max-age=0, no-store" },
      customMetadata: { evidenceId: id, kind, capturedAt }
    })
  ]);
  return metadata;
}
