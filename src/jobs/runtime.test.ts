import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { flags } from "@/flags";
import { runtime } from "./runtime";
import { InMemoryJobStore } from "./store";

describe("runtime store selector (AC-6)", () => {
  it("forces the in memory store when NODE_ENV is test", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(flags.durableStore).toBe(false);
    expect(runtime.jobs).toBeInstanceOf(InMemoryJobStore);
    const dir = mkdtempSync(path.join(tmpdir(), "doc-intel-runtime-"));
    const previous = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
    runtime.jobs.create("doc_x", "extract");
    expect(existsSync(path.join(dir, "doc-intel.db"))).toBe(false);
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
  });
});
