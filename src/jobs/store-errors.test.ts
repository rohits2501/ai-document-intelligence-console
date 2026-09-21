import { describe, expect, it } from "vitest";
import { StoreDataError, StoreOpenError, storeErrorResponse, withStore } from "./store-errors";

describe("store errors (AC-7)", () => {
  it("maps StoreOpenError to a 5xx JSON body that names the path", async () => {
    const response = storeErrorResponse(
      new StoreOpenError("/tmp/doc-intel.db", new Error("locked")),
    );
    expect(response).not.toBeNull();
    expect(response?.status).toBe(500);
    const body = (await response!.json()) as { error: string; db_path: string };
    expect(body.error).toBe("store unavailable");
    expect(body.db_path).toBe("/tmp/doc-intel.db");
  });

  it("maps StoreDataError to a 5xx without swallowing it as success", async () => {
    const response = storeErrorResponse(
      new StoreDataError("corrupt event row", { job_id: "job_1", event_id: 3 }),
    );
    expect(response?.status).toBe(500);
    const body = (await response!.json()) as { error: string; job_id: string };
    expect(body.error).toBe("corrupt event row");
    expect(body.job_id).toBe("job_1");
  });

  it("lets withStore return the 5xx instead of falling through", async () => {
    const result = await withStore(() => {
      throw new StoreOpenError("/x", "nope");
    });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(500);
  });
});
