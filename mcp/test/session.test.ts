import { describe, it, expect, vi } from "vitest";
import { getValidJwt, type SupaSession } from "../src/session";

function kvStub(initial: SupaSession) {
  let stored = JSON.stringify(initial);
  return {
    get: vi.fn(async () => stored),
    put: vi.fn(async (_k: string, v: string) => { stored = v; }),
    delete: vi.fn(async () => { stored = ""; }),
    _peek: () => (stored ? JSON.parse(stored) as SupaSession : null),
  };
}

describe("getValidJwt", () => {
  it("returns the stored token when not near expiry", async () => {
    const kv = kvStub({ access_token: "a", refresh_token: "r", expires_at: 10_000_000_000_000 });
    const jwt = await getValidJwt(kv as any, "grant1", vi.fn() as any, () => 1_000);
    expect(jwt).toBe("a");
  });

  it("refreshes and persists when within 60s of expiry", async () => {
    const now = 1_000_000;
    const kv = kvStub({ access_token: "old", refresh_token: "r-old", expires_at: now + 30_000 });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      access_token: "new", refresh_token: "r-new", expires_in: 3600,
    }), { status: 200 }));
    const jwt = await getValidJwt(kv as any, "grant1", fetchMock as any, () => now);
    expect(jwt).toBe("new");
    expect(kv._peek()!.access_token).toBe("new");
    expect(kv._peek()!.refresh_token).toBe("r-new");
  });

  it("throws and clears the binding when refresh fails", async () => {
    const now = 1_000_000;
    const kv = kvStub({ access_token: "old", refresh_token: "bad", expires_at: now });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 400 }));
    await expect(getValidJwt(kv as any, "grant1", fetchMock as any, () => now))
      .rejects.toThrow(/re-?login/i);
    expect(kv.delete).toHaveBeenCalled();
  });
});
