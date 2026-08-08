export const SUPABASE_URL = "https://wmbtdzlcqgdfqdxvaqeb.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_soBWDz8wvsusMhEdVLm-LA_gp6IQWhK";
export const DASHBOARD_URL = "https://kisilov-vadim.github.io/learn/";
// Space-separated list of RPC functions the MCP is allowed to proxy.
export const RPC_FUNCTIONS = [
  "get_schema", "get_dashboard", "get_subject_context", "get_topic",
  "create_session", "end_session", "create_subject", "update_subject",
  "delete_subject", "add_topic", "update_topic", "add_touch", "update_methods",
  "query_topics", "query_touches", "query_sessions",
  "manage_rules",
] as const;
export type RpcFunction = (typeof RPC_FUNCTIONS)[number];
