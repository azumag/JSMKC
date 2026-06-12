/**
 * Tests for the CDM qualification "sheet player order" helpers.
 *
 * These helpers reproduce, in JavaScript, the row/block ordering that the
 * CDM template derives via its own dynamic-array formulas. Getting the order
 * exactly right is what lets the fill maps place a match into the correct
 * player block without ever writing to a formula cell.
 *
 * Ground truth for the formulas lives in the template cell dumps:
 *   /tmp/cdm-analysis/sheet2025/sheet_BM_Qualifications.txt
 *     F2 = VSTACK(IF(P4>0, SEQUENCE(P2/P4,1,1,P4), ""), IF(P4>1, ...2,P4), ...)
 *     G2 = XLOOKUP(F2, Order, Nickname)  -> the G2# spill order we reproduce.
 */

import {
  computeSheetPlayerOrder,
  synthesizeModeOrders,
  excelCaseInsensitiveCompare,
} from "@/lib/cdm-export/fill/sheet-player-order";
import type { CdmModeQualification, CdmPlayer } from "@/lib/cdm-export/types";

function player(id: string, nickname: string, name = nickname): CdmPlayer {
  return { id, name, nickname };
}

function qual(
  id: string,
  group: string,
  seeding: number | null,
  nickname = id,
): CdmModeQualification {
  return {
    player: player(id, nickname),
    seeding,
    group,
    points: 0,
    score: 0,
  };
}

describe("excelCaseInsensitiveCompare", () => {
  it("sorts case-insensitively ascending", () => {
    const input = ["banana", "Apple", "cherry", "Berry"];
    const sorted = [...input].sort(excelCaseInsensitiveCompare);
    expect(sorted).toEqual(["Apple", "banana", "Berry", "cherry"]);
  });

  it("treats upper and lower case of the same letter as equal for ordering", () => {
    // "Ale" vs "ale" compare equal case-insensitively; stable tie-break by
    // raw code units keeps a deterministic order ('A'=65 < 'a'=97).
    expect(excelCaseInsensitiveCompare("Ale", "ale")).toBeLessThan(0);
    expect(excelCaseInsensitiveCompare("ale", "Ale")).toBeGreaterThan(0);
  });

  it("returns 0 for identical strings", () => {
    expect(excelCaseInsensitiveCompare("Drew", "Drew")).toBe(0);
  });

  it("orders by the first differing character, not by length, when prefixes match case-insensitively", () => {
    expect(excelCaseInsensitiveCompare("ab", "ABC")).toBeLessThan(0); // shorter prefix sorts first
    expect(excelCaseInsensitiveCompare("ABC", "ab")).toBeGreaterThan(0);
  });
});

describe("synthesizeModeOrders", () => {
  it("interleaves groups so the sheet re-derives the app groups (2 groups of 4)", () => {
    // Group A (gi=0): seeds 1..4 -> Orders 1, 3, 5, 7 (1 + k*G, G=2)
    // Group B (gi=1): seeds 1..4 -> Orders 2, 4, 6, 8 (2 + k*G)
    const quals = [
      qual("a1", "A", 1),
      qual("a2", "A", 2),
      qual("a3", "A", 3),
      qual("a4", "A", 4),
      qual("b1", "B", 1),
      qual("b2", "B", 2),
      qual("b3", "B", 3),
      qual("b4", "B", 4),
    ];
    const orders = synthesizeModeOrders(quals);
    expect(orders.get("a1")).toBe(1);
    expect(orders.get("a2")).toBe(3);
    expect(orders.get("a3")).toBe(5);
    expect(orders.get("a4")).toBe(7);
    expect(orders.get("b1")).toBe(2);
    expect(orders.get("b2")).toBe(4);
    expect(orders.get("b3")).toBe(6);
    expect(orders.get("b4")).toBe(8);
  });

  it("orders players within a group by app seeding ascending (not by input order)", () => {
    const quals = [
      qual("a3", "A", 3),
      qual("a1", "A", 1),
      qual("a2", "A", 2),
    ];
    const orders = synthesizeModeOrders(quals); // 1 group, G=1 -> Order=1+k
    expect(orders.get("a1")).toBe(1);
    expect(orders.get("a2")).toBe(2);
    expect(orders.get("a3")).toBe(3);
  });

  it("handles three groups (G=3): A=1,4,7 B=2,5,8 C=3,6,9", () => {
    const quals = [
      qual("a1", "A", 1),
      qual("a2", "A", 2),
      qual("a3", "A", 3),
      qual("b1", "B", 1),
      qual("b2", "B", 2),
      qual("b3", "B", 3),
      qual("c1", "C", 1),
      qual("c2", "C", 2),
      qual("c3", "C", 3),
    ];
    const orders = synthesizeModeOrders(quals);
    expect([orders.get("a1"), orders.get("a2"), orders.get("a3")]).toEqual([1, 4, 7]);
    expect([orders.get("b1"), orders.get("b2"), orders.get("b3")]).toEqual([2, 5, 8]);
    expect([orders.get("c1"), orders.get("c2"), orders.get("c3")]).toEqual([3, 6, 9]);
  });

  it("places players with null seeding after seeded players, in stable input order", () => {
    const quals = [
      qual("a2", "A", 2),
      qual("aX", "A", null),
      qual("a1", "A", 1),
      qual("aY", "A", null),
    ];
    const orders = synthesizeModeOrders(quals); // G=1
    expect(orders.get("a1")).toBe(1);
    expect(orders.get("a2")).toBe(2);
    expect(orders.get("aX")).toBe(3); // first null in input order
    expect(orders.get("aY")).toBe(4);
  });
});

describe("computeSheetPlayerOrder", () => {
  it("returns group A players then group B players, each by app seeding ascending", () => {
    const quals = [
      qual("b2", "B", 2),
      qual("a2", "A", 2),
      qual("b1", "B", 1),
      qual("a1", "A", 1),
    ];
    const order = computeSheetPlayerOrder(quals).map((q) => q.player.id);
    expect(order).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("matches the index used to assign player blocks (block i owner = order[i])", () => {
    const quals = [
      qual("a1", "A", 1),
      qual("a2", "A", 2),
      qual("b1", "B", 1),
      qual("b2", "B", 2),
    ];
    const order = computeSheetPlayerOrder(quals);
    // Block 0 -> a1, block 1 -> a2, block 2 -> b1, block 3 -> b2
    expect(order[0].player.id).toBe("a1");
    expect(order[2].player.id).toBe("b1");
  });

  it("is consistent with synthesizeModeOrders ascending values", () => {
    const quals = [
      qual("a1", "A", 1),
      qual("a2", "A", 2),
      qual("b1", "B", 1),
      qual("b2", "B", 2),
    ];
    const orders = synthesizeModeOrders(quals);
    const seq = computeSheetPlayerOrder(quals);
    // The G2# spill walks Order values 1,2,3,... so the i-th block owner is the
    // player whose synthesized Order makes it land at spill position i.
    // For this even 2x2 case spill order is a1(1), b1(2), a2(3), b2(4)?? No:
    // F2 lists group A first (Orders 1,3), then group B (Orders 2,4). XLOOKUP
    // keeps that listing order, so spill = a1, a2, b1, b2.
    expect(seq.map((q) => q.player.id)).toEqual(["a1", "a2", "b1", "b2"]);
    // Sanity: Orders are the interleaved synthesis.
    expect(orders.get("a1")).toBe(1);
    expect(orders.get("a2")).toBe(3);
    expect(orders.get("b1")).toBe(2);
    expect(orders.get("b2")).toBe(4);
  });

  it("returns an empty array for no qualifications", () => {
    expect(computeSheetPlayerOrder([])).toEqual([]);
  });
});
