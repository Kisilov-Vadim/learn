import OAuthProvider from "@cloudflare/workers-oauth-provider";
import loginHandler from "./login";
import { LearnMcp } from "./agent";

export { LearnMcp };

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: LearnMcp.serve("/mcp"),
  defaultHandler: loginHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
