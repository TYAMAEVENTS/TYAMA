import type { QuestionContentSettings } from "./content-intents.ts";
import type { QuestionType } from "./types.ts";

export const CATALOG_VERSION = 1;
export const GUEST_PRESET_ID = "guest_balanced_v1";
export const CUSTOMER_PRESET_ID = "customer_generic_v1";
export const WEDDING_PRESET_ID = "customer_wedding_v1";

export type CatalogField = {
  type: QuestionType;
  prompt: string;
  help_text: string | null;
  is_required: boolean;
  default_privacy: "host_only" | "review_required" | "public_allowed";
  settings: QuestionContentSettings;
};

const subject = {
  birthday: "іменинника або іменинницю",
  wedding: "наречених",
  corporate: "команду або героя події",
  other: "героя або героїв події",
} as const;

function field(template: string, type: QuestionType, prompt: string, policy: CatalogField["default_privacy"], settings: QuestionContentSettings = {}, required = false): CatalogField {
  return { type, prompt, help_text: null, is_required: required, default_privacy: policy, settings: { schema_version: 1, template_id: template, template_version: 1, semantic_key: template, public_source_policy: policy === "host_only" ? "host_only" : settings.public_source_policy ?? "review_required", ...settings } };
}

export function guestBalancedPreset(eventType: keyof typeof subject): CatalogField[] {
  const hero = subject[eventType];
  const relation = eventType === "wedding" ? "Ким ви доводитеся нареченим та як давно ви знайомі?" : eventType === "corporate" ? "Який у вас зв’язок із командою або героєм події та як давно ви знайомі?" : `Ким ви доводитеся ${hero} та як давно ви знайомі?`;
  const moduleKey = "who_said.primary";
  const automatic = { public_source_policy: "automatic_with_consent" as const };
  return [
    field("guest.relationship.v1", "short_text", relation, "host_only", {}, true),
    field("guest.who_said.quote.v1", "long_text", `Опишіть ${hero} однією короткою фразою — так, щоб інші могли вгадати, хто це сказав.`, "review_required", { ...automatic, module_key: moduleKey, module_role: "primary", content_intents: ["who_said"], who_said_role: "quote" }),
    field("guest.who_said.selfie.v1", "media", "А тепер додайте своє селфі. Його можуть показати тільки під час розкриття автора у «Хто це сказав?» на цій події.", "review_required", { ...automatic, module_key: moduleKey, module_role: "companion", content_intents: ["who_said", "media"], who_said_role: "selfie", media_role: "who_said_selfie", media_constraints: { allowed_kinds: ["image"], max_files: 1, capture: "user", public_image_policy: "automatic_with_consent", video_policy: "host_only", audio_policy: "host_only" } }),
    field("guest.family_feud.association.v1", "short_text", `Яке перше слово або образ спадає вам на думку про ${hero}?`, "review_required", { ...automatic, content_intents: ["family_feud"] }),
    field("guest.family_feud.signature.v1", "short_text", `Яка звичка, фраза або риса одразу видає ${hero} серед інших?`, "review_required", { ...automatic, content_intents: ["family_feud"] }),
    field("guest.family_feud.free_day.v1", "short_text", `Який сценарій вільного дня найбільше схожий на ${hero}?`, "review_required", { ...automatic, content_intents: ["family_feud"] }),
    field("guest.family_feud.superpower.v1", "short_text", `Яка суперсила або неочевидний талант є в ${hero}?`, "review_required", { ...automatic, content_intents: ["family_feud"] }),
    field("guest.story.first_memory.v1", "long_text", eventType === "corporate" ? "Який ваш перший або найяскравіший спільний спогад із командою чи героєм події?" : "Як ви познайомилися або який ваш перший спільний спогад?", "review_required", { ...automatic, content_intents: ["story"] }),
    field("guest.story.character.v1", "long_text", eventType === "wedding" ? "Розкажіть коротку історію, після якої одразу зрозуміло, які вони разом." : "Розкажіть коротку історію, після якої одразу зрозуміло, яка це людина або команда.", "review_required", { ...automatic, content_intents: ["story"] }),
    field("guest.wish_prediction.v1", "long_text", `Яке побажання або дружній прогноз ви хочете залишити для ${hero}?`, "review_required", { ...automatic, content_intents: ["story"] }),
    field("guest.media.gallery.v1", "media", "Додайте фото, відео або аудіо для програми цієї події. Фото можуть потрапити у слайдшоу; відео й аудіо спочатку перегляне ведучий.", "review_required", { ...automatic, content_intents: ["media"], media_role: "gallery", media_constraints: { allowed_kinds: ["image", "video", "audio"], max_files: 9, public_image_policy: "automatic_with_consent", video_policy: "review_required", audio_policy: "review_required" } }),
    field("guest.safety.private.v1", "long_text", "Чого ведучому точно не варто згадувати або показувати публічно?", "host_only"),
  ];
}

const customerPrompts = ["Як до вас звертатися?", "Якою має бути атмосфера цієї події?", "Що гості мають відчути наприкінці?", "Хто з гостей особливо важливий і чому?", "Які люди, історії або моменти точно мають прозвучати?", "Які теми, жарти, люди або згадки потрібно уникати?", "Які формати взаємодії з гостями вам подобаються, а які ні?", "Яка музика, фільми, меми або культурні речі точно про вас?", "Чи готуються сюрпризи, про які має знати ведучий?", "Чиї імена або прізвища важливо правильно вимовити?", "Які фото, відео або аудіо варто попросити у гостей?", "Що ще ведучий має зрозуміти про вас і подію?"];
const weddingPrompts = ["Як ви познайомилися?", "Яке було перше враження одне про одного?", "Коли ви зрозуміли, що це серйозно?", "Розкажіть історію освідчення або рішення одружитися.", "Які ваші смішні, милі або дуже впізнавані звички?", "Які спільні мрії, плани або пригоди вас об’єднують?"];

export function customerPreset(eventType: keyof typeof subject): CatalogField[] {
  const prompts = eventType === "wedding" ? [...customerPrompts, ...weddingPrompts] : customerPrompts;
  return prompts.map((prompt, index) => field(`customer.${eventType === "wedding" && index >= customerPrompts.length ? "wedding" : "generic"}.${index + 1}.v1`, index === 0 || index === 9 ? "short_text" : "long_text", prompt, [3, 5, 8, 9, 10, 11].includes(index) ? "host_only" : "review_required", {}, index === 0));
}

export function customQuestionSettings(): QuestionContentSettings {
  return { schema_version: 1, semantic_key: `custom.${crypto.randomUUID()}`, public_source_policy: "review_required", content_intents: [] };
}
