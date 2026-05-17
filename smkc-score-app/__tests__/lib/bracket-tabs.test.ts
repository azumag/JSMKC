import { BRACKET_TABS } from "../../src/lib/bracket-tabs";

describe("BRACKET_TABS", () => {
  it("provides the shared finals/playoff tab values used by finals pages", () => {
    expect(BRACKET_TABS).toEqual({
      finals: "finals",
      playoff: "playoff",
    });
  });
});
