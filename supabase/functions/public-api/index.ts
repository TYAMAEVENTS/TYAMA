import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { payloadAuthorizesPublicMedia } from "./media-policy.ts";
import { sanitizePublicPresentation } from "./public-presentation.ts";

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
      .select("id,event_id,host_id,title,description,audience,status,published_revision_id,allow_images,allow_video,allow_audio")
      .eq("public_token_hash", tokenHash)
      .eq("status", "published")
      .maybeSingle();
    if (error) return json({ error: "Request failed" }, 500);
    if (!questionnaire) return json(null, 404);
    const { data: memberships, error: questionsError } = await admin
      .from("questionnaire_revision_questions")
      .select("sort_order,is_required,questions!inner(id,type,prompt,help_text,settings)")
      .eq("revision_id", questionnaire.published_revision_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (questionsError) return json({ error: "Request failed" }, 500);
    const { data: revision } = await admin.from("questionnaire_revisions").select("id,source_set_hash,policy_version").eq("id", questionnaire.published_revision_id).single();
    const questions = (memberships ?? []).map((membership) => {
      const question = membership.questions as unknown as { id: string; type: string; prompt: string; help_text?: string | null; settings?: JsonObject };
      const settings = question.settings ?? {};
      const constraints = settings.media_constraints && typeof settings.media_constraints === "object" ? settings.media_constraints as JsonObject : {};
      return {
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        help_text: question.help_text ?? null,
        is_required: membership.is_required,
        sort_order: membership.sort_order,
        input_config: {
          options: Array.isArray(settings.options) ? settings.options : undefined,
          allowed_kinds: Array.isArray(constraints.allowed_kinds) ? constraints.allowed_kinds : undefined,
          max_files: typeof constraints.max_files === "number" ? constraints.max_files : undefined,
          multiple: typeof constraints.max_files === "number" ? constraints.max_files > 1 : undefined,
          capture: typeof constraints.capture === "string" ? constraints.capture : undefined,
          consent_copy: "Я погоджуюся на використання дозволених відповідей і фото лише в межах цієї події.",
          consent_version: "pack2-consent-v1",
        },
      };
    });
    return json({
      id: questionnaire.id,
      revision_id: revision?.id,
      source_set_hash: revision?.source_set_hash,
      policy_version: revision?.policy_version,
      title: questionnaire.title,
      description: questionnaire.description,
      audience: questionnaire.audience,
      allow_images: questionnaire.allow_images,
      allow_video: questionnaire.allow_video,
      allow_audio: questionnaire.allow_audio,
      collection_state: questionnaire.status,
      questions,
    });
  }

  if (action === "begin_submission_draft") {
    const tokenHash = String(body.token_hash ?? "");
    const idempotencyHash = String(body.idempotency_hash ?? "");
    const draftCapabilityHash = String(body.draft_capability_hash ?? "");
    const displayName = String(body.display_name ?? "").trim().slice(0, 160);
    if (![tokenHash, idempotencyHash, draftCapabilityHash].every((value) => /^[0-9a-f]{64}$/.test(value)) || !displayName) return json({ error: "Invalid request" }, 400);
    const { data, error } = await admin.rpc("begin_public_submission_draft", { p_token_hash: tokenHash, p_idempotency_hash: idempotencyHash, p_capability_hash: draftCapabilityHash, p_display_name: displayName });
    if (error) return json({ error: "Draft unavailable" }, 400);
    return json(data, 201);
  }

  if (action === "save_submission_draft") {
    const draftCapabilityHash = String(body.draft_capability_hash ?? "");
    if (!/^[0-9a-f]{64}$/.test(draftCapabilityHash) || !Array.isArray(body.answers)) return json({ error: "Invalid request" }, 400);
    const { error } = await admin.rpc("save_public_submission_draft", { p_capability_hash: draftCapabilityHash, p_answers: body.answers });
    if (error) return json({ error: "Draft rejected" }, 400);
    return json({ saved: true });
  }

  if (action === "finalize_submission_draft") {
    const draftCapabilityHash = String(body.draft_capability_hash ?? "");
    const sourceSetHash = String(body.source_set_hash ?? "");
    const consentVersion = String(body.consent_version ?? "");
    if (!/^[0-9a-f]{64}$/.test(draftCapabilityHash) || !/^[0-9a-f]{64}$/.test(sourceSetHash) || !consentVersion) return json({ error: "Invalid request" }, 400);
    const { data, error } = await admin.rpc("finalize_public_submission_draft", { p_capability_hash: draftCapabilityHash, p_consent: body.consent === true, p_consent_version: consentVersion, p_source_set_hash: sourceSetHash });
    if (error) return json({ error: "Finalization rejected" }, 400);
    return json(data);
  }

  if (action === "submit_questionnaire") {
    const tokenHash = String(body.token_hash ?? "");
    const idempotencyHash = String(body.idempotency_hash ?? "");
    const displayName = String(body.display_name ?? "");
    const answers = body.answers;
    if (!/^[0-9a-f]{64}$/.test(tokenHash) || !/^[0-9a-f]{64}$/.test(idempotencyHash)) return json({ error: "Invalid request" }, 400);
    const { data: allowed, error: limitError } = await admin.rpc("consume_public_submission_limit", {
      p_questionnaire_token_hash: tokenHash,
      p_limit: 300,
      p_window_seconds: 900,
    });
    if (limitError) return json({ error: "Submission temporarily unavailable" }, 503);
    if (!allowed) return json({ error: "Too many submissions. Try again later." }, 429);
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

    let { data: prepared, error: prepareError } = await admin.rpc("prepare_public_draft_media_upload", {
      p_capability_hash: submissionCapabilityHash,
      p_question_id: questionId,
      p_original_filename: originalFilename,
      p_mime_type: mimeType,
      p_size_bytes: sizeBytes,
    });
    if (prepareError) ({ data: prepared, error: prepareError } = await admin.rpc("prepare_media_upload", { p_questionnaire_token_hash: tokenHash, p_submission_capability_hash: submissionCapabilityHash, p_question_id: questionId, p_original_filename: originalFilename, p_mime_type: mimeType, p_size_bytes: sizeBytes }));
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

    let { data: accepted, error: completeError } = await admin.rpc("complete_public_draft_media_upload", {
      p_capability_hash: submissionCapabilityHash,
      p_asset_id: assetId,
      p_actual_size_bytes: actualSize,
      p_actual_mime_type: actualMime,
    });
    if (completeError) ({ data: accepted, error: completeError } = await admin.rpc("complete_media_upload", { p_submission_capability_hash: submissionCapabilityHash, p_asset_id: assetId, p_actual_size_bytes: actualSize, p_actual_mime_type: actualMime }));
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
    return json(state ? { ...state, public_payload: sanitizePublicPresentation(state.public_payload), event_title: event.title } : {
      event_title: event.title,
      revision: 0,
      mode: "idle",
      public_payload: {},
      updated_at: event.updated_at,
    });
  }

  if (action === "get_public_media") {
    const tokenHash = String(body.token_hash ?? "");
    const assetId = String(body.asset_id ?? "");
    if (!/^[0-9a-f]{64}$/.test(tokenHash) || !UUID_PATTERN.test(assetId)) return json(null, 404);

    const { data: event, error: eventError } = await admin
      .from("events")
      .select("id,host_id")
      .eq("public_screen_token_hash", tokenHash)
      .eq("public_screen_enabled", true)
      .maybeSingle();
    if (eventError) return json({ error: "Request failed" }, 500);
    if (!event) return json(null, 404);

    const { data: state, error: stateError } = await admin
      .from("live_state")
      .select("source_event_kit_item_id,public_payload")
      .eq("event_id", event.id)
      .eq("host_id", event.host_id)
      .maybeSingle();
    if (stateError) return json({ error: "Request failed" }, 500);
    if (!state?.source_event_kit_item_id) return json(null, 404);

    const { data: item, error: itemError } = await admin
      .from("event_kit_items")
      .select("item_type,data")
      .eq("id", state.source_event_kit_item_id)
      .eq("event_id", event.id)
      .eq("host_id", event.host_id)
      .in("status", ["approved", "used"])
      .eq("privacy_status", "public_allowed")
      .eq("do_not_use", false)
      .maybeSingle();
    if (itemError) return json({ error: "Request failed" }, 500);
    const publicPayload = sanitizePublicPresentation(state.public_payload);
    if (!payloadAuthorizesPublicMedia(publicPayload, assetId)) return json(null, 404);

    const { data: asset, error: assetError } = await admin
      .from("media_assets")
      .select("storage_path,kind,mime_type")
      .eq("id", assetId)
      .eq("event_id", event.id)
      .eq("host_id", event.host_id)
      .eq("status", "ready")
      .eq("moderation_status", "approved")
      .eq("privacy_status", "public_allowed")
      .maybeSingle();
    if (assetError) return json({ error: "Request failed" }, 500);
    if (!asset) return json(null, 404);

    const { data: signed, error: signedError } = await admin.storage
      .from("event-media")
      .createSignedUrl(asset.storage_path, 60);
    if (signedError || !signed?.signedUrl) return json({ error: "Media unavailable" }, 503);
    return json({ url: signed.signedUrl, kind: asset.kind, mime_type: asset.mime_type });
  }

  return json({ error: "Unknown action" }, 404);
});
