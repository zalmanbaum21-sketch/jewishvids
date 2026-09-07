import { describe, expect, it } from "vitest";
import { getVideoArtistLabel } from "./videoPresentation";

describe("getVideoArtistLabel", () => {
  it("returns a trimmed artist label for library cards", () => {
    expect(getVideoArtistLabel("  Rabbi David Cohen  ")).toBe("Rabbi David Cohen");
  });

  it("hides missing or blank artist attribution", () => {
    expect(getVideoArtistLabel(undefined)).toBeNull();
    expect(getVideoArtistLabel("   ")).toBeNull();
  });
});
