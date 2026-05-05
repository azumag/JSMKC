import { getCupForFormIndex, isRemovableCupForm, removeCupFormAt } from "@/lib/gp-finals-score-form";

describe("GP finals score form helpers", () => {
  it("keeps the first cup form non-removable", () => {
    expect(isRemovableCupForm(0)).toBe(false);
    expect(removeCupFormAt(["Mushroom", "Flower"], 0)).toEqual(["Mushroom", "Flower"]);
  });

  it("keeps all FT-seeded cup forms non-removable", () => {
    const forms = ["Mushroom", "Flower", "Star", "Special"];

    expect(isRemovableCupForm(0, 3)).toBe(false);
    expect(isRemovableCupForm(1, 3)).toBe(false);
    expect(isRemovableCupForm(2, 3)).toBe(false);
    expect(isRemovableCupForm(3, 3)).toBe(true);
    expect(removeCupFormAt(forms, 1, 3)).toEqual(forms);
    expect(removeCupFormAt(forms, 3, 3)).toEqual(["Mushroom", "Flower", "Star"]);
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

  it("uses the assigned GP finals cup sequence before falling back", () => {
    const fallbackCups = ["Mushroom", "Flower", "Star", "Special"];

    expect(getCupForFormIndex(0, ["Flower", "Special", "Mushroom"], fallbackCups, "Flower")).toBe("Flower");
    expect(getCupForFormIndex(1, ["Flower", "Special", "Mushroom"], fallbackCups, "Flower")).toBe("Special");
    expect(getCupForFormIndex(2, ["Flower", "Special", "Mushroom"], fallbackCups, "Flower")).toBe("Mushroom");
  });

  it("avoids repeating assigned cups when it has to fall back", () => {
    const fallbackCups = ["Mushroom", "Flower", "Star", "Special"];

    expect(getCupForFormIndex(1, ["Flower"], fallbackCups, "Flower")).toBe("Mushroom");
  });
});
