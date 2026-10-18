import { JobConsole } from "@/components/JobConsole";

export default function JobPage({ params }: { params: { id: string } }) {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "var(--space-8) var(--space-4)" }}>
      <JobConsole jobId={params.id} />
    </main>
  );
}
