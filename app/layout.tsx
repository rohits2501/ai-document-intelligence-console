import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Document Intelligence Console",
  description:
    "Operator console for long running document processing jobs: upload, stream progress, review and approve extracted fields.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
