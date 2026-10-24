import http from "node:http";
import https from "node:https";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectEngine } from "./engine";
import { InferenceEngineError } from "./types";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("selectEngine", () => {
  it("uses the TypeScript engine when the backend is unset, blank, or ts (AC-6)", () => {
    expect(selectEngine({}).id).toBe("ts-symbolic-engine");
    expect(selectEngine({ INFERENCE_BACKEND: "" }).id).toBe("ts-symbolic-engine");
    expect(selectEngine({ INFERENCE_BACKEND: " TS " }).id).toBe("ts-symbolic-engine");
  });

  it("refuses an unknown backend instead of falling back to TypeScript (AC-6)", () => {
    expect(() => selectEngine({ INFERENCE_BACKEND: "bogus" })).toThrow(InferenceEngineError);
    try {
      selectEngine({ INFERENCE_BACKEND: "bogus" });
    } catch (err) {
      expect(err).toBeInstanceOf(InferenceEngineError);
      expect((err as InferenceEngineError).code).toBe("not_configured");
    }
  });

  it("does not call the network when the backend is http (AC-8)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
    const httpSpy = vi.spyOn(http, "request");
    const httpsSpy = vi.spyOn(https, "request");

    let caught: unknown;
    try {
      selectEngine({
        INFERENCE_BACKEND: "http",
        INFERENCE_SERVICE_URL: "http://127.0.0.1:9",
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(InferenceEngineError);
    expect((caught as InferenceEngineError).code).toBe("not_configured");
    expect((caught as InferenceEngineError).message).not.toContain("127.0.0.1");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(httpSpy).not.toHaveBeenCalled();
    expect(httpsSpy).not.toHaveBeenCalled();
  });
});
