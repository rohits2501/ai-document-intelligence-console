import { UploadPanel } from "@/components/UploadPanel";
import { JobList } from "@/components/JobList";
import { Walkthrough } from "@/walkthrough/Walkthrough";
import { homeTour } from "@/walkthrough/tours";
import { ThemeToggle } from "@/theme/ThemeToggle";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "var(--space-6) var(--space-4)" }}>
      <header style={{ marginBottom: "var(--space-5)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            marginBottom: "var(--space-2)",
          }}
        >
          <h1 style={{ fontSize: "var(--text-2xl)", margin: 0 }}>Document Intelligence Console</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexShrink: 0 }}>
            <a
              href="/study.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--text-muted)",
                fontSize: "var(--text-sm)",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Study plan
            </a>
            <ThemeToggle />
          </div>
        </div>
        <p style={{ color: "var(--text-muted)", margin: 0 }}>
          Upload a document, watch a long running job stream its progress, then review and approve
          the extracted fields. Default extraction is a mock provider, so no keys are required.
        </p>
      </header>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <UploadPanel />
        <JobList />
      </div>
      <Walkthrough tour={homeTour} />
    </main>
  );
}
