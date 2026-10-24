import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EngineInput } from "./engine";
import { OpenOntologiesCliEngine } from "./open-ontologies-adapter";
import { INFERENCE_ERROR_MESSAGES, InferenceEngineError } from "./types";

const SECRET = "SECRET-VENDOR-NAME";
let dataDir = "";
let binDir = "";
const originalDataDir = process.env.DATA_DIR;

function script(name: string, body: string): string {
  const file = path.join(binDir, name);
  writeFileSync(file, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  return file;
}

function input(signal = new AbortController().signal): EngineInput {
  return {
    documentId: "doc-1",
    jobId: "job-1",
    facts: [],
    approvals: new Map(),
    dataTurtle: `doc:hasVendorName "${SECRET}" .`,
    signal,
  };
}

function runsLeft(): string[] {
  const dir = path.join(dataDir, "inference-runs");
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

async function expectCode(bin: string, code: keyof typeof INFERENCE_ERROR_MESSAGES) {
  const engine = new OpenOntologiesCliEngine({ bin });
  let caught: unknown;
  try {
    await engine.infer(input());
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(InferenceEngineError);
  const error = caught as InferenceEngineError;
  expect(error.code).toBe(code);
  expect(error.message).toBe(INFERENCE_ERROR_MESSAGES[code]);
  expect(error.message).not.toContain(SECRET);
  expect(error.message).not.toContain("inference-runs");
  expect(error.message).not.toContain(dataDir);
  expect(runsLeft()).toEqual([]);
  return engine;
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "inference-data-"));
  binDir = mkdtempSync(path.join(tmpdir(), "inference-bin-"));
  process.env.DATA_DIR = dataDir;
});

afterEach(() => {
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(binDir, { recursive: true, force: true });
});

describe("OpenOntologiesCliEngine", () => {
  it("returns the printed result and records an argument array (AC-7)", async () => {
    const bin = script(
      "ok.cjs",
      `
        const fs = require("node:fs");
        const path = require("node:path");
        fs.writeFileSync(path.join(${JSON.stringify(binDir)}, "argv.json"), JSON.stringify(process.argv.slice(2)));
        process.stdout.write(JSON.stringify({ inferredFacts: [], findings: [] }));
      `,
    );
    const engine = new OpenOntologiesCliEngine({ bin });
    const output = await engine.infer(input());
    const argv = JSON.parse(readFileSync(path.join(binDir, "argv.json"), "utf8")) as string[];

    expect(engine.id).toBe("open-ontologies-cli");
    expect(output).toEqual({ inferredFacts: [], findings: [] });
    expect(argv[0]).toBe("--data");
    expect(argv[1]).toMatch(/data\.ttl$/);
    expect(argv[2]).toBe("--shapes");
    expect(argv[3]).toMatch(/shapes\.ttl$/);
    expect(runsLeft()).toEqual([]);
  });

  it("reports a missing binary (AC-7)", async () => {
    await expectCode("/no/such/bin", "binary_missing");
  });

  it("reports a crash and hides the document text (AC-7)", async () => {
    const bin = script(
      "crash.cjs",
      `process.stderr.write(${JSON.stringify(SECRET)}); process.exit(1);`,
    );
    await expectCode(bin, "crashed");
  });

  it("reports a timeout when the binary sleeps past 5 seconds (AC-7)", async () => {
    const bin = script("slow.cjs", "setTimeout(() => {}, 10000);");
    const started = Date.now();
    await expectCode(bin, "timeout");
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(4500);
    expect(elapsed).toBeLessThan(9000);
  }, 15000);

  it("reports output that is not result JSON (AC-7)", async () => {
    const bin = script("bad.cjs", `process.stdout.write(${JSON.stringify(`not json ${SECRET}`)});`);
    await expectCode(bin, "bad_output");
  });
});
