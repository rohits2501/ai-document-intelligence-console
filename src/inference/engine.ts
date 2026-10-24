import { DeterministicTsInferenceEngine } from "./ts-rule-engine";
import { OpenOntologiesCliEngine } from "./open-ontologies-adapter";
import {
  InferenceEngineError,
  type CanonicalFact,
  type EngineId,
  type EngineOutput,
} from "./types";

export interface EngineInput {
  documentId: string;
  jobId: string;
  facts: readonly CanonicalFact[];
  /** Field key → `ReviewedField.approved` from the live review. Empty for synthetic presets. */
  approvals: ReadonlyMap<string, boolean>;
  /** Deterministic Turtle of the canonical facts, as a CLI engine receives it. */
  dataTurtle: string;
  signal: AbortSignal;
}

export interface InferenceEngine {
  readonly id: EngineId;
  infer(input: EngineInput): Promise<EngineOutput>;
}

/**
 * Reads `INFERENCE_BACKEND`. Unset or `ts` is the TypeScript engine (Vercel, CI, any visitor).
 * `cli` is the local binary. `http` and any other name are not configured in this phase, so the
 * preview fails instead of silently falling back to `ts`.
 */
export function selectEngine(env: NodeJS.ProcessEnv = process.env): InferenceEngine {
  const backend = (env.INFERENCE_BACKEND ?? "ts").trim().toLowerCase();
  switch (backend) {
    case "":
    case "ts":
      return new DeterministicTsInferenceEngine();
    case "cli":
      return new OpenOntologiesCliEngine({ bin: env.OPEN_ONTOLOGIES_BIN });
    case "http":
    default:
      throw new InferenceEngineError("not_configured");
  }
}
