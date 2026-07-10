import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "StayBook Hotel Platform",
};

/**
 * Root layout — deliberately thin. All tenant chrome (theme, header, footer,
 * i18n provider) lives in s/[domain]/[locale]/layout.tsx. The middleware
 * passes the candidate locale via x-locale so <html lang> is correct in the
 * initial SSR payload.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const lang = requestHeaders.get("x-locale") ?? "ko";
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
