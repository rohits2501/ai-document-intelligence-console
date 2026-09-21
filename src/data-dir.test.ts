import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { resolveDataDir } from "./data-dir";

const original = {
  DATA_DIR: process.env.DATA_DIR,
  VERCEL: process.env.VERCEL,
};

afterEach(() => {
  if (original.DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = original.DATA_DIR;
  if (original.VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = original.VERCEL;
});

describe("resolveDataDir (AC-8)", () => {
  it("prefers DATA_DIR when set", () => {
    process.env.DATA_DIR = "/tmp/custom-data";
    process.env.VERCEL = "1";
    expect(resolveDataDir()).toBe(path.resolve("/tmp/custom-data"));
  });

  it("uses /tmp on serverless when DATA_DIR is absent", () => {
    delete process.env.DATA_DIR;
    process.env.VERCEL = "1";
    expect(resolveDataDir()).toBe("/tmp");
  });

  it("uses local .data when neither DATA_DIR nor VERCEL is set", () => {
    delete process.env.DATA_DIR;
    delete process.env.VERCEL;
    expect(resolveDataDir()).toBe(path.join(process.cwd(), ".data"));
  });
});
