import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { getPublicQuestionnaire } from "@/lib/questionnaires/data";
import { AUDIENCE_LABELS } from "@/lib/questionnaires/types";
import { PublicQuestionnaireForm } from "./public-form";

export const metadata: Metadata = { title: "Анкета події", robots: { index: false, follow: false } };

export default async function PublicQuestionnairePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const questionnaire = await getPublicQuestionnaire(token);
  if (!questionnaire) notFound();
  return (
    <main className="public-page">
      <header className="public-header"><BrandMark compact /><span>{AUDIENCE_LABELS[questionnaire.audience]} / приватна анкета</span></header>
      <section className="public-intro"><span className="eyebrow">КОНТЕКСТ ДЛЯ ВАШОЇ ПОДІЇ</span><h1>{questionnaire.title}</h1><p>{questionnaire.description || "Кілька відповідей допоможуть Святу підготувати подію про ваших людей, а не за шаблоном."}</p></section>
      <PublicQuestionnaireForm questionnaire={questionnaire} token={token} idempotencyKey={randomUUID()} />
      <footer className="public-footer">ТЯМА × СВЯТ ГАЛЮК <span>PRIVATE BY DEFAULT</span></footer>
    </main>
  );
}
