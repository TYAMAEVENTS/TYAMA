import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  intent?: "brand" | "neutral" | "danger";
  emphasis?: "solid" | "outline" | "ghost";
  busy?: boolean;
};

export function Button({
  children,
  className = "",
  intent = "brand",
  emphasis = "solid",
  busy = false,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`button button--${intent} button--${emphasis} ${className}`.trim()}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      <span className="button__content">{busy ? "Зачекайте…" : children}</span>
    </button>
  );
}
