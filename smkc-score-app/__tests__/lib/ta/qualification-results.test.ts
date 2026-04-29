import { calculateCourseFirstPlaceCounts } from "@/lib/ta/qualification-results";

describe("TA qualification result helpers", () => {
  it("counts the number of courses where each entry has the fastest time", () => {
    const counts = calculateCourseFirstPlaceCounts([
      { id: "p1", times: { MC1: "1:00.00", DP1: "1:02.00", GV1: "1:00.00" } },
      { id: "p2", times: { MC1: "1:01.00", DP1: "1:01.00", GV1: "1:03.00" } },
      { id: "p3", times: { MC1: "1:02.00", DP1: "1:03.00", GV1: "1:04.00" } },
    ]);

    expect(counts.get("p1")).toBe(2);
    expect(counts.get("p2")).toBe(1);
    expect(counts.get("p3")).toBe(0);
  });

  it("counts every tied fastest entry as No.1 for that course", () => {
    const counts = calculateCourseFirstPlaceCounts([
      { id: "p1", times: { MC1: "1:00.00" } },
      { id: "p2", times: { MC1: "1:00.00" } },
      { id: "p3", times: { MC1: "1:01.00" } },
    ]);

    expect(counts.get("p1")).toBe(1);
    expect(counts.get("p2")).toBe(1);
    expect(counts.get("p3")).toBe(0);
  });

  it("ignores missing and invalid course times", () => {
    const counts = calculateCourseFirstPlaceCounts([
      { id: "p1", times: { MC1: "", DP1: "bad" } },
      { id: "p2", times: null },
    ]);

    expect(counts.get("p1")).toBe(0);
    expect(counts.get("p2")).toBe(0);
  });
});
