import { describe, it, expect } from "vitest";
import { SKILL_TEXT, SERVER_INSTRUCTIONS } from "../src/skill";
import { buildGuideText } from "../src/skill";

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

describe("buildGuideText", () => {
  it("appends a 'no global rules' note when there are none", () => {
    const out = buildGuideText("GUIDE", []);
    expect(out).toContain("GUIDE");
    expect(out).toContain("## Your Personal Rules (global)");
    expect(out).toContain("No global rules set.");
  });

  it("lists only active global rules as 'label: description' bullets", () => {
    const out = buildGuideText("GUIDE", [
      { label: "Examples", text: "Always give a real-world example", active: true },
      { label: "Feynman", text: "Skip the Feynman close", active: false },
      { label: "Tradeoffs", text: "Push harder on tradeoffs", active: true },
    ]);
    expect(out).toContain("- Examples: Always give a real-world example");
    expect(out).toContain("- Tradeoffs: Push harder on tradeoffs");
    expect(out).not.toContain("Feynman");
  });

  it("renders the label alone when a rule has no description", () => {
    const out = buildGuideText("GUIDE", [
      { label: "Be blunt", text: "", active: true },
    ]);
    expect(out).toContain("- Be blunt");
    expect(out).not.toContain("Be blunt:");
  });
});
