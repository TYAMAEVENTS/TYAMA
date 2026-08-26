import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type JsonObject = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function envKey(dictionaryName: string, legacyName: string) {
  const dictionary = JSON.parse(Deno.env.get(dictionaryName) ?? "{}") as Record<string, string>;
  return dictionary.default ?? Deno.env.get(legacyName) ?? "";
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const publishableKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const secretKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!publishableKey || request.headers.get("apikey") !== publishableKey) return json({ error: "Unauthorized" }, 401);

  let body: JsonObject;
  try {
    body = await request.json() as JsonObject;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const action = String(body.action ?? "");
  if (action === "get_questionnaire") {
    const tokenHash = String(body.token_hash ?? "");
    if (!/^[0-9a-f]{64}$/.test(tokenHash)) return json(null, 404);
    const { data: questionnaire, error } = await admin
      .from("questionnaires")
      .select("id,event_id,host_id,title,description,audience,allow_images,allow_video,allow_audio")
      .eq("public_token_hash", tokenHash)
      .eq("status", "published")
      .maybeSingle();
    if (error) return json({ error: "Request failed" }, 500);
    if (!questionnaire) return json(null, 404);
    const { data: questions, error: questionsError } = await admin
      .from("questions")
      .select("id,type,prompt,help_text,is_required,sort_order,settings")
      .eq("questionnaire_id", questionnaire.id)
      .eq("event_id", questionnaire.event_id)
      .eq("host_id", questionnaire.host_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (questionsError) return json({ error: "Request failed" }, 500);
    return json({
      id: questionnaire.id,
      title: questionnaire.title,
      description: questionnaire.description,
      audience: questionnaire.audience,
      allow_images: questionnaire.allow_images,
      allow_video: questionnaire.allow_video,
      allow_audio: questionnaire.allow_audio,
      questions: questions ?? [],
    });
  }

  if (action === "submit_questionnaire") {
    const tokenHash = String(body.token_hash ?? "");
    const idempotencyHash = String(body.idempotency_hash ?? "");
    const displayName = String(body.display_name ?? "");
    const answers = body.answers;
    if (!/^[0-9a-f]{64}$/.test(tokenHash) || !/^[0-9a-f]{64}$/.test(idempotencyHash)) return json({ error: "Invalid request" }, 400);
    const { data, error } = await admin.rpc("submit_questionnaire", {
      p_questionnaire_token_hash: tokenHash,
      p_idempotency_key_hash: idempotencyHash,
      p_display_name: displayName,
      p_answers: answers,
    });
    if (error) return json({ error: "Submission rejected" }, 400);
    return json({ submission_id: data }, 201);
  }

  if (action === "get_public_screen") {
    const tokenHash = String(body.token_hash ?? "");
    if (!/^[0-9a-f]{64}$/.test(tokenHash)) return json(null, 404);
    const { data: event, error } = await admin
      .from("events")
      .select("id,host_id,title,updated_at")
      .eq("public_screen_token_hash", tokenHash)
      .eq("public_screen_enabled", true)
      .maybeSingle();
    if (error) return json({ error: "Request failed" }, 500);
    if (!event) return json(null, 404);
    const { data: state, error: stateError } = await admin
      .from("live_state")
      .select("revision,mode,public_payload,updated_at")
      .eq("event_id", event.id)
      .eq("host_id", event.host_id)
      .maybeSingle();
    if (stateError) return json({ error: "Request failed" }, 500);
    return json(state ? { ...state, event_title: event.title } : {
      event_title: event.title,
      revision: 0,
      mode: "idle",
      public_payload: {},
      updated_at: event.updated_at,
    });
  }

  return json({ error: "Unknown action" }, 404);
});
