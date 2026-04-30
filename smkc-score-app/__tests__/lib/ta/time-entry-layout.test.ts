import {
  TA_FINALS_ROUND_ENTRY_ROW_CLASS,
  TA_FINALS_ROUND_PLAYER_NAME_CLASS,
  TA_TIME_ENTRY_CUP_GRID_CLASS,
  TA_TIME_INPUT_BASE_PROPS,
  TA_TIME_INPUT_HELP_CLASS,
  getTaTimeInputProps,
} from "@/lib/ta/time-entry-layout";

describe("TA time entry layout", () => {
  it("stacks cup cards on mobile and restores two columns from md", () => {
    expect(TA_TIME_ENTRY_CUP_GRID_CLASS.split(" ")).toEqual(
      expect.arrayContaining(["grid", "grid-cols-1", "md:grid-cols-2", "gap-4"]),
    );
    expect(TA_TIME_ENTRY_CUP_GRID_CLASS).not.toContain("grid-cols-2 gap-4");
  });

  it("uses mobile numeric keyboard hints for TA time fields", () => {
    expect(TA_TIME_INPUT_BASE_PROPS).toEqual({
      inputMode: "decimal",
      pattern: "[0-9:.]*",
      autoComplete: "off",
    });
    expect(getTaTimeInputProps("例: 123.45 または 1:23.45")).toEqual({
      ...TA_TIME_INPUT_BASE_PROPS,
      title: "例: 123.45 または 1:23.45",
    });
    expect(TA_TIME_INPUT_HELP_CLASS.split(" ")).toEqual(
      expect.arrayContaining(["text-xs", "leading-relaxed", "text-muted-foreground"]),
    );
  });

  it("keeps TA finals player names on their own mobile row before sm layout", () => {
    expect(TA_FINALS_ROUND_ENTRY_ROW_CLASS.split(" ")).toEqual(
      expect.arrayContaining(["space-y-2", "sm:flex", "sm:space-y-0"]),
    );
    expect(TA_FINALS_ROUND_PLAYER_NAME_CLASS.split(" ")).toEqual(
      expect.arrayContaining(["block", "truncate", "text-base", "sm:text-sm"]),
    );
  });
});
