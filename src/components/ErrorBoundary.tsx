"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/ui";

/**
 * Error boundary for lazily-loaded, browser-only widgets (the pdf.js viewer). A failed dynamic
 * chunk load — e.g. a `ChunkLoadError` after a redeploy, or a flaky network — should degrade to a
 * small fallback with a reload affordance, not replace the whole console with a crash overlay.
 */
interface Props {
  children: ReactNode;
  label?: string;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isChunkError = /ChunkLoadError|Loading chunk/i.test(error.message);
    return (
      <div
        role="alert"
        style={{
          padding: "var(--space-6)",
          display: "grid",
          gap: "var(--space-3)",
          justifyItems: "start",
          color: "var(--text-muted)",
        }}
      >
        <div>
          {this.props.label ?? "This section"} failed to load
          {isChunkError ? " (a stale asset after an update)." : "."}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button onClick={this.reset}>Try again</Button>
          {isChunkError && (
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          )}
        </div>
      </div>
    );
  }
}
