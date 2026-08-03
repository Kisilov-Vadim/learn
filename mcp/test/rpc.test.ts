import { describe, it, expect, vi } from "vitest";
import { callRpc } from "../src/rpc";

describe("callRpc", () => {
  it("POSTs to the rpc endpoint with bearer jwt and apikey, returns parsed json", async () => {
    const fetchMock = vi.fn(async (_url: any, _init?: any) =>
      new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const out = await callRpc(fetchMock as any, "jwt-123", "get_dashboard", undefined);
    expect(out).toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/rest/v1/rpc/get_dashboard");
    expect((init as any).method).toBe("POST");
    const headers = (init as any).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer jwt-123");
    expect(headers["apikey"]).toBeTruthy();
  });

  it("sends the json body when params are given", async () => {
    const fetchMock = vi.fn(async (_url: any, _init?: any) => new Response("null", { status: 200 }));
    await callRpc(fetchMock as any, "jwt", "get_topic", { p_topic_id: "abc" });
    const init = fetchMock.mock.calls[0][1] as any;
    expect(JSON.parse(init.body as string)).toEqual({ p_topic_id: "abc" });
  });

  it("throws with the supabase error body on non-2xx", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "denied" }), { status: 401 }));
    await expect(callRpc(fetchMock as any, "jwt", "get_dashboard", undefined))
      .rejects.toThrow("denied");
  });
});
