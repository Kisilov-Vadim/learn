import { describe, it, expect } from "vitest";
import { validateCallbackBody } from "../src/login";

describe("validateCallbackBody", () => {
  const good = {
    state: "s1",
    access_token: "a",
    refresh_token: "r",
    expires_at: 123,
  };

  it("accepts a well-formed body", () => {
    expect(validateCallbackBody(good)).toEqual(good);
  });

  it("rejects null / non-objects", () => {
    expect(validateCallbackBody(null)).toBeNull();
    expect(validateCallbackBody("nope")).toBeNull();
  });

  it("rejects missing or empty required string fields", () => {
    expect(validateCallbackBody({ ...good, state: "" })).toBeNull();
    expect(validateCallbackBody({ ...good, access_token: undefined })).toBeNull();
    expect(validateCallbackBody({ ...good, refresh_token: 5 })).toBeNull();
  });

  it("rejects a non-numeric expires_at", () => {
    expect(validateCallbackBody({ ...good, expires_at: "soon" })).toBeNull();
  });
});
