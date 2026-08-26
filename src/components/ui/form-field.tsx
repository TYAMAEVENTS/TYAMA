import type { ReactNode } from "react";

export function FormField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="form-field">
      <label htmlFor={id} className="form-field__label">{label}</label>
      <div data-described-by={describedBy || undefined}>{children}</div>
      {hint ? <p id={`${id}-hint`} className="form-field__hint">{hint}</p> : null}
      {error ? <p id={`${id}-error`} role="alert" className="form-field__error">{error}</p> : null}
    </div>
  );
}
