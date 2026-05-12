import { MAX_GP_DRIVER_POINTS } from "@/lib/constants";
import { GP_DRIVER_POINTS_INPUT_PROPS, parseGpDriverPointsInput } from "@/lib/gp-driver-points-input";

describe("GP driver points input", () => {
  it("uses mobile numeric keyboard hints for driver-point fields", () => {
    expect(GP_DRIVER_POINTS_INPUT_PROPS).toEqual({
      type: "text",
      inputMode: "numeric",
      pattern: "[0-9]*",
      autoComplete: "off",
    });
  });

  it("parses integer driver points up to the shared GP maximum", () => {
    expect(parseGpDriverPointsInput("0")).toBe(0);
    expect(parseGpDriverPointsInput(String(MAX_GP_DRIVER_POINTS))).toBe(MAX_GP_DRIVER_POINTS);
    expect(parseGpDriverPointsInput(`  ${MAX_GP_DRIVER_POINTS}  `)).toBe(MAX_GP_DRIVER_POINTS);
  });

  it("rejects decimals, signed values, non-numeric values, unsafe integers, and max overflows", () => {
    expect(parseGpDriverPointsInput("1.5")).toBeNull();
    expect(parseGpDriverPointsInput("-1")).toBeNull();
    expect(parseGpDriverPointsInput("+1")).toBeNull();
    expect(parseGpDriverPointsInput("1e2")).toBeNull();
    expect(parseGpDriverPointsInput("abc")).toBeNull();
    expect(parseGpDriverPointsInput("")).toBeNull();
    expect(parseGpDriverPointsInput("   ")).toBeNull();
    expect(parseGpDriverPointsInput(String(Number.MAX_SAFE_INTEGER) + "0")).toBeNull();
    expect(parseGpDriverPointsInput(String(MAX_GP_DRIVER_POINTS + 1))).toBeNull();
  });
});
