// Supabase Edge Function: STT Transcribe Proxy
// Forwards audio to xAI STT API, keeps XAI_API_KEY server-side.
// Called by TaskMatrix voiceTask.js instead of hitting api.x.ai directly.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const XAI_STT_URL = "https://api.x.ai/v1/stt";
const XAI_API_KEY = Deno.env.get("XAI_API_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!XAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "XAI_API_KEY not configured on server" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    // Forward the exact FormData from the client to xAI
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({ error: "Expected multipart/form-data" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: "No audio file provided" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Reject empty/near-empty recordings early (matching client-side check)
    if (file.size < 100) {
      return new Response(
        JSON.stringify({ error: "voice:no_audio" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Forward to xAI
    const xaiFormData = new FormData();
    xaiFormData.append("file", file, file.name || "recording.webm");

    const xaiResponse = await fetch(XAI_STT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${XAI_API_KEY}` },
      body: xaiFormData,
    });

    if (!xaiResponse.ok) {
      const errText = await xaiResponse.text();
      console.error(`xAI STT error ${xaiResponse.status}:`, errText.substring(0, 200));
      return new Response(
        JSON.stringify({
          error: xaiResponse.status === 401 || xaiResponse.status === 403
            ? "voice:auth_error"
            : `voice:stt_failed:${xaiResponse.status}`,
        }),
        {
          status: xaiResponse.status === 401 || xaiResponse.status === 403 ? 401 : 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    const result = await xaiResponse.json();
    const text = (result.text || "").trim();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "voice:empty_transcript" }),
        { status: 422, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("STT proxy error:", err.message);
    return new Response(
      JSON.stringify({ error: `voice:network:${err.message}` }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
