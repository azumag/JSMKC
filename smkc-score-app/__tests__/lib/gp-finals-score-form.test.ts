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

  it("ignores out-of-range indexes", () => {
    expect(removeCupFormAt(["Mushroom"], 2)).toEqual(["Mushroom"]);
  });
});
