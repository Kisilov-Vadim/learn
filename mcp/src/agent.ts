import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RPC_FUNCTIONS, RpcFunction } from "./config";
import { callRpc } from "./rpc";
import { getValidJwt } from "./session";
import { SKILL_TEXT, SERVER_INSTRUCTIONS } from "./skill";
import { buildToolHandlers, ToolDeps } from "./mcp";

type Props = { grant: string };

export class LearnMcp extends McpAgent<Env, unknown, Props> {
  server = new McpServer(
    { name: "learn", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  async init() {
    const grant = this.props?.grant ?? "";
    const deps: ToolDeps = {
      getJwt: (g) => getValidJwt(this.env.OAUTH_KV, g, fetch),
      callRpc,
      fetchImpl: fetch,
    };
    const handlers = buildToolHandlers(deps, grant);

    this.server.registerPrompt(
      "learn",
      { description: "Start or continue an adaptive learning session." },
      async () => ({
        messages: [{ role: "user", content: { type: "text", text: SKILL_TEXT } }],
      }),
    );

    // The full teaching guide, exposed as a TOOL — MCP prompts/instructions are not
    // reliably auto-injected into the model, but tool results always are. This is how
    // every agent (Desktop, mobile, web, Claude Code) actually receives the methods,
    // decision tree, scoring, and session rules.
    this.server.registerTool(
      "get_guide",
      {
        description:
          "REQUIRED FIRST STEP for any learning session. Returns the complete learn " +
          "teaching guide: the session decision tree, all 5 teaching methods, scoring " +
          "rules, and how to use every other tool. Call this before get_dashboard / " +
          "starting or continuing a session, and follow it exactly.",
        inputSchema: {},
      },
      async () => ({
        content: [{ type: "text" as const, text: SKILL_TEXT }],
      }),
    );

    // Opening the dashboard: the Worker can't open a browser on the user's device,
    // so this returns the URL for the agent to hand the user as a clickable link.
    this.server.registerTool(
      "dashboard_link",
      {
        description:
          "Use when the user wants to open / view their learning dashboard or progress " +
          "page (e.g. 'open my dashboard', 'show my progress'). Returns the dashboard URL " +
          "to give the user as a clickable link — you cannot open a browser yourself.",
        inputSchema: {},
      },
      async () => ({
        content: [
          {
            type: "text" as const,
            text: "Your learning dashboard: https://kisilov-vadim.github.io/learn/",
          },
        ],
      }),
    );

    // Per-function descriptions; the entry-point calls point back to get_guide so the
    // model loads the full instructions even when it starts from a bare "start learning".
    const describe = (fn: RpcFunction): string => {
      if (fn === "manage_rules") {
        return (
          "Manage the user's custom teaching rules (one tool, four actions via p_action). " +
          "list — p_action:'list' with no scope returns { global:[...], subjects:{ id:[...] } }; " +
          "p_scope:'global' returns only global; p_subject_id:<id> returns that subject's rules. " +
          "add — p_action:'add', p_text:<rule>, optional p_subject_id (omit for a global rule). " +
          "update — p_action:'update', p_rule_id:<id>, and p_text and/or p_active. " +
          "delete — p_action:'delete', p_rule_id:<id>. " +
          "Use 'list' (no scope) to answer 'which rules do I have?'."
        );
      }
      const nudge =
        fn === "get_dashboard" || fn === "get_schema" || fn === "get_subject_context"
          ? " IMPORTANT: if you have not already, call `get_guide` first to load how to run the session."
          : "";
      return (
        `learn: ${fn} — proxied Supabase RPC. Pass the p_* params documented in ` +
        `the guide from \`get_guide\`.${nudge}`
      );
    };

    for (const fn of RPC_FUNCTIONS as readonly RpcFunction[]) {
      this.server.registerTool(
        fn,
        {
          description: describe(fn),
          inputSchema: { params: z.record(z.string(), z.unknown()).optional() },
        },
        async ({ params }) => {
          try {
            const data = await handlers[fn]((params as Record<string, unknown>) ?? {});
            return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
          } catch (e) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: (e as Error).message }],
            };
          }
        },
      );
    }
  }
}
