type Payload = Record<string, unknown>;

const text = (value: unknown) => typeof value === "string" && value.length ? value : undefined;
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Payload : {};
const stageAllowed = (stage: string, allowed: string[]) => allowed.includes(stage);

export type SanitizedPresentation = { kind: string; session_mode?: string; item_type?: string; title?: string; content?: string; data?: Payload };

export function sanitizePublicPresentation(raw: unknown): SanitizedPresentation {
  const payload = object(raw);
  const source = object(payload.data);
  const itemType = text(payload.item_type) ?? "";
  const kind = text(source.interactive_kind) ?? "";
  const stage = text(source.stage) ?? "";
  let data: Payload | null = null;

  if (itemType === "interactive" && kind === "family_feud" && stageAllowed(stage, ["intro", "question", "reveal"])) {
    const revealed = new Set(Array.isArray(source.revealed_indexes) ? source.revealed_indexes.map(Number) : []);
    const legacyCount = Math.max(0, Number(source.revealed_count ?? 0));
    const incoming = Array.isArray(source.slots) ? source.slots : Array.isArray(source.answers) ? source.answers : [];
    const slots = incoming.slice(0, 6).map((entry, index) => {
      const row = object(entry);
      const isRevealed = row.revealed === true || revealed.has(index) || (source.generator !== "family_feud_v4" && index < legacyCount);
      return isRevealed
        ? { index, revealed: true, label: text(row.label) ?? "", points: Number(row.points ?? 0) }
        : { index, revealed: false };
    });
    data = { interactive_kind: kind, stage, slots };
    if (text(source.prompt)) data.prompt = text(source.prompt);
    const bonus = object(source.public_bonus);
    if (text(bonus.label)) data.public_bonus = { label: text(bonus.label), ...(text(bonus.author) ? { author: text(bonus.author) } : {}) };
  } else if (itemType === "interactive" && kind === "who_said" && stageAllowed(stage, ["intro", "question", "reveal"])) {
    const revealed = stage === "reveal" && source.revealed === true;
    data = { interactive_kind: kind, stage, revealed, quote: text(source.quote) ?? text(payload.content) ?? "" };
    if (revealed && text(source.author)) {
      data.author = text(source.author);
      const first = Array.isArray(source.asset_ids) ? text(source.asset_ids[0]) : undefined;
      if (first) data.asset_ids = [first];
    }
  } else if (itemType === "interactive" && kind === "dilettantes" && stageAllowed(stage, ["intro", "question", "reveal", "wheel"])) {
    const revealed = stage === "reveal" && source.revealed === true;
    data = { interactive_kind: kind, stage, revealed };
    if (revealed) {
      if (source.correct_answer !== undefined) data.correct_answer = source.correct_answer;
      if (text(source.unit)) data.unit = text(source.unit);
      if (text(source.consequence)) data.consequence = text(source.consequence);
    } else if (stage === "wheel" && text(source.wheel_selected)) data.wheel_selected = text(source.wheel_selected);
  } else if (itemType === "media" && kind === "slideshow" && stageAllowed(stage, ["intro", "question", "reveal"])) {
    const assets = Array.isArray(source.asset_ids) ? source.asset_ids.map(text).filter(Boolean) as string[] : [];
    const current = Math.max(0, Math.min(Number(source.current_index ?? 0), Math.max(assets.length - 1, 0)));
    const alreadyCurrentOnly = source.slide_number !== undefined;
    const asset = alreadyCurrentOnly ? assets[0] : assets[current];
    data = {
      interactive_kind: kind,
      stage,
      slide_number: Number(source.slide_number ?? (assets.length ? current + 1 : 0)),
      slide_count: Number(source.slide_count ?? assets.length),
      ...(asset ? { asset_ids: [asset] } : {}),
    };
  }

  if (!data) return { kind: "clear", ...(text(payload.session_mode) ? { session_mode: text(payload.session_mode) } : {}) };
  return {
    kind: itemType === "media" ? "media" : stage === "reveal" ? "reveal" : "question",
    item_type: itemType,
    ...(text(payload.title) ? { title: text(payload.title) } : {}),
    ...(text(payload.content) ? { content: text(payload.content) } : {}),
    data,
    ...(text(payload.session_mode) ? { session_mode: text(payload.session_mode) } : {}),
  };
}
