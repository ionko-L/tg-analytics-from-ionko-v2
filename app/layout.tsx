import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TG Analytics from ionko",
  description: "AI analytics for public Telegram channels via Apify and OpenRouter.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
