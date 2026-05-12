import { DRIVER_POINTS, MAX_GP_DRIVER_POINTS, TOTAL_GP_RACES } from "@/lib/constants";

describe("GP driver points limit", () => {
  it("derives the per-match maximum from first-place points and GP race count", () => {
    expect(MAX_GP_DRIVER_POINTS).toBe(DRIVER_POINTS[1] * TOTAL_GP_RACES);
    expect(MAX_GP_DRIVER_POINTS).toBe(45);
  });
});
