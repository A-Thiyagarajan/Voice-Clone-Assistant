import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice Clone Assistant",
  description: "Record, transcribe, transform, and export AI-generated speech."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
