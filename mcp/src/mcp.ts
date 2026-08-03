import { RPC_FUNCTIONS } from "./config";
import { callRpc } from "./rpc";

export interface ToolDeps {
  getJwt: (grant: string) => Promise<string>;
  callRpc: typeof callRpc;
  fetchImpl: typeof fetch;
}

export function buildToolHandlers(deps: ToolDeps, grant: string) {
  const handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {};
  for (const fn of RPC_FUNCTIONS) {
    handlers[fn] = async (params: Record<string, unknown>) => {
      const jwt = await deps.getJwt(grant);
      const hasParams = params && Object.keys(params).length > 0;
      return deps.callRpc(deps.fetchImpl, jwt, fn, hasParams ? params : undefined);
    };
  }
  return handlers;
}
