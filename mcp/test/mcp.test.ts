import { describe, it, expect, vi } from "vitest";
import { buildToolHandlers } from "../src/mcp";

describe("buildToolHandlers", () => {
  it("creates one handler per RPC function and proxies params through", async () => {
    const calls: any[] = [];
    const deps = {
      getJwt: vi.fn(async () => "jwt-x"),
      callRpc: vi.fn(async (_f: any, jwt: string, fn: string, params: any) => {
        calls.push({ jwt, fn, params }); return { fn, params };
      }),
      fetchImpl: vi.fn(),
    };
    const handlers = buildToolHandlers(deps as any, "grant-1");
    expect(Object.keys(handlers)).toContain("get_dashboard");
    expect(Object.keys(handlers)).toContain("add_touch");

    const out = await handlers["get_topic"]({ p_topic_id: "t1" });
    expect(calls[0]).toEqual({ jwt: "jwt-x", fn: "get_topic", params: { p_topic_id: "t1" } });
    expect(out).toEqual({ fn: "get_topic", params: { p_topic_id: "t1" } });
  });

  it("passes undefined params when the object is empty", async () => {
    const seen: any[] = [];
    const deps = {
      getJwt: vi.fn(async () => "j"),
      callRpc: vi.fn(async (_f: any, _j: any, _fn: any, params: any) => { seen.push(params); return null; }),
      fetchImpl: vi.fn(),
    };
    const handlers = buildToolHandlers(deps as any, "g");
    await handlers["get_dashboard"]({});
    expect(seen[0]).toBeUndefined();
  });

  it("registers a manage_rules handler that proxies params", async () => {
    const calls: any[] = [];
    const deps = {
      getJwt: vi.fn(async () => "jwt-r"),
      callRpc: vi.fn(async (_f: any, jwt: string, fn: string, params: any) => {
        calls.push({ jwt, fn, params }); return { ok: true };
      }),
      fetchImpl: vi.fn(),
    };
    const handlers = buildToolHandlers(deps as any, "grant-r");
    expect(Object.keys(handlers)).toContain("manage_rules");
    await handlers["manage_rules"]({ p_action: "list", p_scope: "global" });
    expect(calls[0]).toEqual({
      jwt: "jwt-r",
      fn: "manage_rules",
      params: { p_action: "list", p_scope: "global" },
    });
  });
});
