import { GP_DRIVER_POINTS_INPUT_PROPS } from "@/lib/gp-driver-points-input";

describe("GP driver points input", () => {
  it("uses mobile numeric keyboard hints for driver-point fields", () => {
    expect(GP_DRIVER_POINTS_INPUT_PROPS).toEqual({
      type: "text",
      inputMode: "numeric",
      pattern: "[0-9]*",
      autoComplete: "off",
    });
  });
});
