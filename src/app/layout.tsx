import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ТЯМА", template: "%s — ТЯМА" },
  description: "Інтелект-сервіс для ведучих",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
