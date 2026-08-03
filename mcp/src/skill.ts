export { SKILL_TEXT } from "./skill-text.generated";

export const SERVER_INSTRUCTIONS =
  "This connector is a personal adaptive learning tutor (spaced repetition + " +
  "5 teaching methods). To start or continue a study session, FIRST call the " +
  "`get_guide` tool to load the full teaching guide (decision tree, methods, " +
  "scoring), then follow it. Use the provided tools for all data operations — " +
  "never invent progress data.";
