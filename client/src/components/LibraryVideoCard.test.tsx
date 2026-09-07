import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LibraryVideoCard from "./LibraryVideoCard";

const baseVideo = {
  id: 1,
  title: "Friday evening learning",
  sizeBytes: 1024,
  storageUrl: "/manus-storage/jewish-videos/videos/lesson.mp4",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("LibraryVideoCard", () => {
  it("renders artist attribution when provided", () => {
    const markup = renderToStaticMarkup(<LibraryVideoCard video={{ ...baseVideo, artist: "Rabbi David Cohen" }} />);
    expect(markup).toContain("Rabbi David Cohen");
  });

  it("omits artist attribution when it is blank", () => {
    const markup = renderToStaticMarkup(<LibraryVideoCard video={{ ...baseVideo, artist: "   " }} />);
    expect(markup).not.toContain("Rabbi");
  });
});
