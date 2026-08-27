import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicScreenState } from "@/lib/live/data";
import { PublicScreen } from "./public-screen";

export const metadata: Metadata = { title: "TYAMA Public Screen", robots: { index: false, follow: false } };

export default async function PublicScreenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await getPublicScreenState(token);
  if (!state) notFound();
  return <PublicScreen initialState={state} token={token} />;
}
