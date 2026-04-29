import { TA_TIME_ENTRY_CUP_GRID_CLASS } from "@/lib/ta/time-entry-layout";

describe("TA time entry layout", () => {
  it("stacks cup cards on mobile and restores two columns from md", () => {
    expect(TA_TIME_ENTRY_CUP_GRID_CLASS.split(" ")).toEqual(
      expect.arrayContaining(["grid", "grid-cols-1", "md:grid-cols-2", "gap-4"]),
    );
    expect(TA_TIME_ENTRY_CUP_GRID_CLASS).not.toContain("grid-cols-2 gap-4");
  });
});
