import { describe, it, expect } from "vitest";
import { withUploadLock } from "./uploads-store";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("withUploadLock", () => {
  it("serializes concurrent work for the same uploadId (no interleave)", async () => {
    // Shared cursor mimicking read-then-append: without a lock, both tasks read 0 and clobber.
    let committed = 0;
    const order: string[] = [];

    async function appendOne(label: string) {
      return withUploadLock("up_same", async () => {
        const read = committed;
        await tick(); // yield: interleaving would happen here without the lock
        committed = read + 1;
        order.push(label);
        return committed;
      });
    }

    const [a, b] = await Promise.all([appendOne("a"), appendOne("b")]);
    expect(committed).toBe(2); // both appends counted, none clobbered
    expect(new Set([a, b])).toEqual(new Set([1, 2]));
    expect(order).toHaveLength(2);
  });

  it("runs different uploadIds independently", async () => {
    const seen: string[] = [];
    await Promise.all([
      withUploadLock("up_x", async () => {
        seen.push("x");
      }),
      withUploadLock("up_y", async () => {
        seen.push("y");
      }),
    ]);
    expect(seen.sort()).toEqual(["x", "y"]);
  });
});
