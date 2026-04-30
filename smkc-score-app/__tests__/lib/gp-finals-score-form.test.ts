import { isRemovableCupForm, removeCupFormAt } from "@/lib/gp-finals-score-form";

describe("GP finals score form helpers", () => {
  it("keeps the first cup form non-removable", () => {
    expect(isRemovableCupForm(0)).toBe(false);
    expect(removeCupFormAt(["Mushroom", "Flower"], 0)).toEqual(["Mushroom", "Flower"]);
  });

  it("removes added cup forms by index without mutating the original list", () => {
    const forms = ["Mushroom", "Flower", "Star"];

    expect(isRemovableCupForm(1)).toBe(true);
    expect(removeCupFormAt(forms, 1)).toEqual(["Mushroom", "Star"]);
    expect(forms).toEqual(["Mushroom", "Flower", "Star"]);
  });

  it("drops the filled score state for a removed added cup", () => {
    const forms = [
      { cup: "Mushroom", manualPoints1: "45", manualPoints2: "0" },
      { cup: "Flower", manualPoints1: "45", manualPoints2: "0" },
      { cup: "Star", manualPoints1: "0", manualPoints2: "45" },
    ];

    expect(removeCupFormAt(forms, 1)).toEqual([
      { cup: "Mushroom", manualPoints1: "45", manualPoints2: "0" },
      { cup: "Star", manualPoints1: "0", manualPoints2: "45" },
    ]);
  });

  it("ignores out-of-range indexes", () => {
    expect(removeCupFormAt(["Mushroom"], 2)).toEqual(["Mushroom"]);
  });
});
