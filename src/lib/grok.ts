const XAI_URL = "https://api.x.ai/v1/chat/completions";

export function xaiApiKey(): string | null {
  const key = String(process.env["XAI_API_KEY"] ?? process.env["GROK_API_KEY"] ?? "").trim();
  return key || null;
}

export function grokModel(): string {
  return String(process.env["GROK_MODEL"] ?? process.env["XAI_MODEL"] ?? "grok-4-fast").trim() || "grok-4-fast";
}

export function isGrokConfigured(): boolean {
  return xaiApiKey() !== null;
}

export async function grokComplete(opts: {
  system: string;
  user: string;
  json?: boolean;
  timeoutMs?: number;
}): Promise<string> {
  const key = xaiApiKey();
  if (!key) throw new Error("Grok is not configured. Set XAI_API_KEY.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);
  try {
    const res = await fetch(XAI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: grokModel(),
        temperature: opts.json ? 0.1 : 0.3,
        stream: false,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`Grok ${res.status}: ${raw.slice(0, 220)}`);
    }
    const payload = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
      output_text?: string;
    };
    const text = payload.choices?.[0]?.message?.content ?? payload.output_text ?? "";
    if (!text.trim()) throw new Error("Grok returned an empty reply.");
    return text.trim();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Grok timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const slice = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  const value = JSON.parse(slice) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Grok did not return a JSON object.");
  }
  return value as Record<string, unknown>;
}
