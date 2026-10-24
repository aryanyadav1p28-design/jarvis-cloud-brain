const MODEL = "gemma4:31b";
const MAX_BODY_BYTES = 24_000;
const MAX_MESSAGES = 12;
const MAX_TEXT_CHARS = 6_000;

function responseJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return responseJson({ ok: true, service: "jarvis-cloud-brain", model: MODEL });
    }

    if (request.method !== "POST" || url.pathname !== "/chat") {
      return responseJson({ error: "Not found" }, 404);
    }

    if (!env.OLLAMA_API_KEY || !env.JARVIS_CLIENT_KEY) {
      return responseJson({ error: "Backend secrets are not configured" }, 503);
    }

    const suppliedKey = request.headers.get("x-jarvis-client-key") || "";
    if (!constantTimeEqual(suppliedKey, env.JARVIS_CLIENT_KEY)) {
      return responseJson({ error: "Unauthorized" }, 401);
    }

    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > MAX_BODY_BYTES) {
      return responseJson({ error: "Request too large" }, 413);
    }

    let body;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
        return responseJson({ error: "Request too large" }, 413);
      }
      body = JSON.parse(raw);
    } catch {
      return responseJson({ error: "Invalid JSON" }, 400);
    }

    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MAX_MESSAGES) {
      return responseJson({ error: "messages must contain 1–12 items" }, 400);
    }

    const messages = [];
    for (const item of body.messages) {
      if (!item || !["system", "user", "assistant"].includes(item.role) || typeof item.content !== "string") {
        return responseJson({ error: "Each message needs a valid role and text content" }, 400);
      }
      if (item.content.length > MAX_TEXT_CHARS) {
        return responseJson({ error: "A message is too long" }, 400);
      }
      messages.push({ role: item.role, content: item.content });
    }

    let upstream;
    try {
      upstream = await fetch("https://ollama.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${env.OLLAMA_API_KEY}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          max_tokens: 500,
          temperature: 0.3,
          stream: false
        })
      });
    } catch {
      return responseJson({ error: "AI provider could not be reached" }, 502);
    }

    const upstreamText = await upstream.text();
    let data;
    try {
      data = JSON.parse(upstreamText);
    } catch {
      return responseJson({
        error: "AI provider returned an unreadable response",
        providerStatus: upstream.status
      }, 502);
    }

    if (!upstream.ok) {
      // Do not return provider headers, tokens, or internal response details to the app.
      return responseJson({
        error: "AI provider request failed",
        providerStatus: upstream.status,
        detail: data?.error?.message || data?.error || "Check model/provider availability and free credits."
      }, upstream.status === 429 ? 429 : 502);
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return responseJson({ error: "AI provider returned no text" }, 502);
    }

    return responseJson({ reply: reply.trim(), model: MODEL });
  }
};
