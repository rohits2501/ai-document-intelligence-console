import type { Metadata } from "next";
import { ThemeScript } from "@/theme/ThemeScript";
import { PerfHud } from "@/perf/PerfHud";
import "./globals.css";

export const metadata: Metadata = {
  title: "Document Intelligence Console",
  description:
    "Operator console for long running document processing jobs: upload, stream progress, review and approve extracted fields.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <ThemeScript />
        {children}
        <PerfHud />
      </body>
    </html>
  );
}
