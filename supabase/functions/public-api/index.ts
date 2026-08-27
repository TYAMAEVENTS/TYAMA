import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type JsonObject = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  if (action === "prepare_media_upload") {
    const tokenHash = String(body.token_hash ?? "");
    const submissionCapabilityHash = String(body.submission_capability_hash ?? "");
    const questionId = String(body.question_id ?? "");
    const originalFilename = String(body.original_filename ?? "").trim().slice(0, 255);
    const mimeType = String(body.mime_type ?? "");
    const sizeBytes = Number(body.size_bytes ?? 0);
    if (
      !/^[0-9a-f]{64}$/.test(tokenHash)
      || !/^[0-9a-f]{64}$/.test(submissionCapabilityHash)
      || !UUID_PATTERN.test(questionId)
      || !originalFilename
      || !Number.isSafeInteger(sizeBytes)
    ) return json({ error: "Invalid media request" }, 400);

    const { data: prepared, error: prepareError } = await admin.rpc("prepare_media_upload", {
      p_questionnaire_token_hash: tokenHash,
      p_submission_capability_hash: submissionCapabilityHash,
      p_question_id: questionId,
      p_original_filename: originalFilename,
      p_mime_type: mimeType,
      p_size_bytes: sizeBytes,
    });
    if (prepareError || !prepared || typeof prepared !== "object") {
      return json({ error: "Media upload rejected" }, 400);
    }

    const preparedAsset = prepared as { asset_id?: string; storage_path?: string; kind?: string };
    if (!UUID_PATTERN.test(String(preparedAsset.asset_id ?? "")) || !preparedAsset.storage_path) {
      return json({ error: "Media upload rejected" }, 400);
    }

    const { data: signedUpload, error: signedUploadError } = await admin.storage
      .from("event-media")
      .createSignedUploadUrl(preparedAsset.storage_path, { upsert: false });
    if (signedUploadError || !signedUpload?.signedUrl || !signedUpload.token) {
      await admin.from("media_assets").update({ status: "rejected", moderation_status: "rejected" }).eq("id", preparedAsset.asset_id);
      return json({ error: "Media upload unavailable" }, 503);
    }

    return json({
      asset_id: preparedAsset.asset_id,
      storage_path: preparedAsset.storage_path,
      kind: preparedAsset.kind,
      upload_url: signedUpload.signedUrl,
      upload_token: signedUpload.token,
    }, 201);
  }

  if (action === "complete_media_upload") {
    const submissionCapabilityHash = String(body.submission_capability_hash ?? "");
    const assetId = String(body.asset_id ?? "");
    if (!/^[0-9a-f]{64}$/.test(submissionCapabilityHash) || !UUID_PATTERN.test(assetId)) {
      return json({ error: "Invalid media request" }, 400);
    }

    const { data: asset, error: assetError } = await admin
      .from("media_assets")
      .select("id,storage_path,mime_type,size_bytes,status")
      .eq("id", assetId)
      .eq("status", "pending")
      .maybeSingle();
    if (assetError || !asset) return json({ error: "Media upload unavailable" }, 404);

    const pathParts = asset.storage_path.split("/");
    const filename = pathParts.pop();
    const folder = pathParts.join("/");
    if (!filename || !folder) return json({ error: "Media upload unavailable" }, 404);
    const { data: objects, error: listError } = await admin.storage
      .from("event-media")
      .list(folder, { search: filename, limit: 10 });
    const stored = objects?.find((item) => item.name === filename);
    const metadata = stored?.metadata as { size?: number; mimetype?: string } | undefined;
    const actualSize = Number(metadata?.size ?? 0);
    const actualMime = String(metadata?.mimetype ?? "");
    if (listError || !stored || !Number.isSafeInteger(actualSize) || !actualMime) {
      return json({ error: "Upload is not complete" }, 409);
    }

    const { data: accepted, error: completeError } = await admin.rpc("complete_media_upload", {
      p_submission_capability_hash: submissionCapabilityHash,
      p_asset_id: assetId,
      p_actual_size_bytes: actualSize,
      p_actual_mime_type: actualMime,
    });
    if (completeError) return json({ error: "Media upload rejected" }, 400);
    if (!accepted) {
      await admin.storage.from("event-media").remove([asset.storage_path]);
      return json({ error: "Uploaded file did not pass validation" }, 400);
    }
    return json({ asset_id: assetId, status: "ready" });
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
