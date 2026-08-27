import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/session";
import { publicSupabaseEnv } from "@/lib/env";
import { supabaseRest } from "@/lib/supabase/rest";

type HostMediaAsset = {
  id: string;
  bucket: string;
  storage_path: string;
  original_filename: string | null;
  status: string;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const accessToken = await getAccessToken();
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { assetId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const assets = await supabaseRest<HostMediaAsset[]>(
    `media_assets?select=id,bucket,storage_path,original_filename,status&id=eq.${encodeURIComponent(assetId)}&status=eq.ready&limit=1`,
    { accessToken },
  );
  const asset = assets[0];
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { url, publishableKey } = publicSupabaseEnv();
  const objectPath = asset.storage_path.split("/").map(encodeURIComponent).join("/");
  const signedResponse = await fetch(`${url}/storage/v1/object/sign/${encodeURIComponent(asset.bucket)}/${objectPath}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  if (!signedResponse.ok) return NextResponse.json({ error: "Media unavailable" }, { status: 404 });
  const payload = await signedResponse.json() as { signedURL?: string; signedUrl?: string };
  const relativeUrl = payload.signedURL ?? payload.signedUrl;
  if (!relativeUrl) return NextResponse.json({ error: "Media unavailable" }, { status: 404 });
  const redirectUrl = new URL(relativeUrl, url);
  if (request.nextUrl.searchParams.get("download") === "1") {
    redirectUrl.searchParams.set("download", asset.original_filename || "tyama-media");
  }
  return NextResponse.redirect(redirectUrl, { headers: { "Cache-Control": "private, no-store" } });
}
