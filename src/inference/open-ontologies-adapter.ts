import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveDataDir } from "@/data-dir";
import type { EngineInput, InferenceEngine } from "./engine";
import { RULES_TURTLE, SHAPES_TURTLE } from "./ontology";
import { EngineOutput, InferenceEngineError, type InferenceErrorCode } from "./types";

/**
 * Local only engine (`open-ontologies-cli`). Runs the binary with an argument array (never a
 * shell), the request's abort signal, and a fixed timeout, in a fresh directory per run that is
 * always removed. Anything other than exit 0 with result JSON is an error, never a result.
 */

export const CLI_TIMEOUT_MS = 5000;
const DEFAULT_BIN = "open-ontologies";

interface ExecFailure {
  code?: unknown;
  killed?: boolean;
  signal?: unknown;
  name?: string;
}

function classify(err: unknown, signal: AbortSignal): InferenceErrorCode {
  const e = (err ?? {}) as ExecFailure;
  if (e.name === "AbortError" || e.code === "ABORT_ERR" || signal.aborted) return "aborted";
  if (e.code === "ENOENT") return "binary_missing";
  if (e.killed) return "timeout";
  return "crashed";
}

function run(
  bin: string,
  args: string[],
  opts: { cwd: string; signal: AbortSignal },
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { cwd: opts.cwd, signal: opts.signal, timeout: CLI_TIMEOUT_MS, encoding: "utf8" },
      (err, stdout) => {
        if (err) reject(new InferenceEngineError(classify(err, opts.signal)));
        else resolve(stdout);
      },
    );
  });
}

export class OpenOntologiesCliEngine implements InferenceEngine {
  readonly id = "open-ontologies-cli" as const;
  private readonly bin: string;

  constructor(opts: { bin?: string } = {}) {
    const configured = opts.bin?.trim();
    this.bin = configured ? configured : DEFAULT_BIN;
  }

  async infer(input: EngineInput): Promise<EngineOutput> {
    if (input.signal.aborted) throw new InferenceEngineError("aborted");
    const runDir = path.join(resolveDataDir(), "inference-runs", randomUUID());
    try {
      await mkdir(runDir, { recursive: true });
      const dataPath = path.join(runDir, "data.ttl");
      const shapesPath = path.join(runDir, "shapes.ttl");
      await writeFile(dataPath, input.dataTurtle, "utf8");
      await writeFile(shapesPath, `${SHAPES_TURTLE}\n${RULES_TURTLE}`, "utf8");

      const stdout = await run(this.bin, ["--data", dataPath, "--shapes", shapesPath], {
        cwd: runDir,
        signal: input.signal,
      });

      let json: unknown;
      try {
        json = JSON.parse(stdout);
      } catch {
        throw new InferenceEngineError("bad_output");
      }
      const parsed = EngineOutput.safeParse(json);
      if (!parsed.success) throw new InferenceEngineError("bad_output");
      return parsed.data;
    } finally {
      await rm(runDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
