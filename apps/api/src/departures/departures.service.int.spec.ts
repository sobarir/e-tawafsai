import { describe, expect, it } from "vitest";
import { departures } from "@cometkit/db";

describe("Departures DB Schema", () => {
  it("exports departures table", () => {
    expect(departures).toBeDefined();
  });
});
