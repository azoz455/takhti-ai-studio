const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...cors } });
}
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!origin) return "";
  if (configured.includes("*") || configured.includes(origin)) return origin;
  return null;
}
function corsHeaders(origin) {
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, X-App-Token", "access-control-max-age": "86400", "vary": "Origin" };
}
function authorized(request, env) {
  if (!env.APP_TOKEN) return false; // Fail closed: a token must be configured.
  const provided = request.headers.get("X-App-Token") || "";
  if (provided.length !== env.APP_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ env.APP_TOKEN.charCodeAt(i);
  return diff === 0;
}
function extractOpenAIText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data.output || []) for (const c of item.content || []) if (c.type === "output_text" && c.text) parts.push(c.text);
  return parts.join("\n").trim();
}
async function generateOpenAI(body, env) {
  if (!env.OPENAI_API_KEY) throw new Error("لم يُضبط OPENAI_API_KEY في أسرار Worker.");
  const model = body.model || env.OPENAI_MODEL || "gpt-4.1-mini";
  if (typeof model !== "string" || !/^[a-zA-Z0-9._-]{1,100}$/.test(model)) throw new Error("اسم نموذج OpenAI غير صالح.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: body.prompt, temperature: body.temperature ?? 0.7, max_output_tokens: Math.min(Math.max(Number(body.maxOutputTokens) || 1200, 100), 4000) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI API (${response.status}): ${data.error?.message || "تعذر تنفيذ الطلب"}`);
  return { text: extractOpenAIText(data), model };
}
async function generateGemini(body, env) {
  if (!env.GEMINI_API_KEY) throw new Error("لم يُضبط GEMINI_API_KEY في أسرار Worker.");
  const model = body.model || env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model)) throw new Error("اسم النموذج غير صالح.");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: body.prompt }] }], generationConfig: { temperature: body.temperature ?? 0.7, maxOutputTokens: Math.min(Math.max(Number(body.maxOutputTokens) || 1200, 100), 4000) } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Gemini API (${response.status}): ${data.error?.message || "تعذر تنفيذ الطلب"}`);
  const text = (data.candidates || []).flatMap(c => c.content?.parts || []).map(p => p.text || "").filter(Boolean).join("\n").trim();
  if (!text) throw new Error("لم يُرجع النموذج نصًا؛ قد تكون الاستجابة محجوبة أو فارغة.");
  return { text, model };
}
export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (origin === null) return json({ error: "Origin غير مسموح." }, 403);
    const cors = origin ? corsHeaders(origin) : {};
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      if (!authorized(request, env)) return json({ error: "غير مصرح. تحقق من APP_TOKEN." }, 401, cors);
      return json({ ok: true, service: "takhti-ai-v13-worker", providers: { openai: Boolean(env.OPENAI_API_KEY), gemini: Boolean(env.GEMINI_API_KEY) }, timestamp: new Date().toISOString() }, 200, cors);
    }
    if (request.method !== "POST" || url.pathname !== "/api/generate") return json({ error: "المسار غير موجود." }, 404, cors);
    if (!authorized(request, env)) return json({ error: "غير مصرح. تحقق من APP_TOKEN." }, 401, cors);
    const declared = Number(request.headers.get("Content-Length") || 0);
    if (declared > 20000) return json({ error: "حجم الطلب يتجاوز الحد المسموح." }, 413, cors);
    let body;
    try { body = await request.json(); } catch { return json({ error: "JSON غير صالح." }, 400, cors); }
    if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) return json({ error: "حقل prompt مطلوب." }, 400, cors);
    if (body.prompt.length > 12000) return json({ error: "الأمر طويل جدًا؛ الحد 12000 حرف." }, 413, cors);
    const provider = body.provider === "gemini" ? "gemini" : body.provider === "openai" ? "openai" : null;
    if (!provider) return json({ error: "المزود يجب أن يكون openai أو gemini." }, 400, cors);
    const temperature = Number(body.temperature ?? 0.7);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1.2) return json({ error: "درجة الإبداع يجب أن تكون بين 0 و1.2." }, 400, cors);
    try {
      const result = provider === "openai" ? await generateOpenAI({ ...body, temperature }, env) : await generateGemini({ ...body, temperature }, env);
      return json({ ok: true, provider, model: result.model, text: result.text, usage: "راجع لوحة المزود لمعرفة الاستهلاك والتكلفة الفعلية." }, 200, cors);
    } catch (error) {
      return json({ error: error.message || "خطأ غير متوقع في مزود النموذج." }, 502, cors);
    }
  }
};
