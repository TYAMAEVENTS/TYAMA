import type { ReactNode } from "react";

export function StatusMessage({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  return (
    <div className={`status status--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
