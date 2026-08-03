import { describe, it, expect } from "vitest";
import { SKILL_TEXT, SERVER_INSTRUCTIONS } from "../src/skill";

describe("embedded skill", () => {
  it("SKILL_TEXT is populated and contains the teaching toolkit", () => {
    expect(SKILL_TEXT.length).toBeGreaterThan(5000);
    expect(SKILL_TEXT).toContain("Teaching Toolkit");
    expect(SKILL_TEXT).toContain("Session Decision Tree");
  });
  it("SERVER_INSTRUCTIONS mentions the learn prompt", () => {
    expect(SERVER_INSTRUCTIONS).toContain("learn");
  });
});
