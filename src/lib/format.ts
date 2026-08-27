const DATE_FORMATTER = new Intl.DateTimeFormat("uk-UA", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Kyiv",
});

export function formatEventDate(value: string | null): string {
  if (!value) return "Дата ще не вказана";
  const date = new Date(`${value}T12:00:00Z`);
  return DATE_FORMATTER.format(date);
}
