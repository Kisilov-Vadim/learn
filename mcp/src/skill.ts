export { SKILL_TEXT } from "./skill-text.generated";

export const SERVER_INSTRUCTIONS =
  "This connector is a personal adaptive learning tutor (spaced repetition + " +
  "5 teaching methods). To start or continue a study session, FIRST call the " +
  "`get_guide` tool to load the full teaching guide (decision tree, methods, " +
  "scoring), then follow it. Use the provided tools for all data operations — " +
  "never invent progress data.";

export interface GlobalRule {
  text: string;
  active: boolean;
}

// Appends the user's active global rules to the guide text returned by get_guide.
export function buildGuideText(skillText: string, globalRules: GlobalRule[]): string {
  const active = globalRules.filter((r) => r.active);
  const header = "\n\n## Your Personal Rules (global)\n\n";
  if (active.length === 0) {
    return skillText + header + "No global rules set.\n";
  }
  const body =
    "These are standing instructions from the user. Honor them for the whole session.\n\n" +
    active.map((r) => `- ${r.text}`).join("\n") +
    "\n";
  return skillText + header + body;
}
