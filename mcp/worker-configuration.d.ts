import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
declare global {
  interface Env {
    OAUTH_KV: KVNamespace;
    OAUTH_PROVIDER: OAuthHelpers;
    MCP_OBJECT: DurableObjectNamespace;
  }
}
export {};
