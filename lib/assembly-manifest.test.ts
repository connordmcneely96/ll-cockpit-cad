// Sprint 30L (foundation) — manifest tests.
// vitest is not yet wired into the cad package.json; this ships for CI / future test run.
import { describe, it, expect } from "vitest";
import { getManifest } from "./assembly-manifest";

describe("getManifest", () => {
  it("pump: 5 components, exactly one sized shaft at order_index 0", () => {
    const m = getManifest("pump");
    expect(m).toHaveLength(5);
    const sized = m.filter((c) => c.status === "sized");
    expect(sized).toHaveLength(1);
    expect(sized[0].feature_type).toBe("shaft");
    expect(sized[0].order_index).toBe(0);
    // order_index is contiguous 0..4
    expect(m.map((c) => c.order_index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("gear_reducer: input shaft is the sized anchor, output shaft is declared", () => {
    const m = getManifest("gear_reducer");
    const input = m.find((c) => c.name === "Input Shaft");
    const output = m.find((c) => c.name === "Output Shaft");
    expect(input?.status).toBe("sized");
    expect(output?.status).toBe("declared");
    // exactly one sized component
    expect(m.filter((c) => c.status === "sized")).toHaveLength(1);
  });

  it("unknown project type falls back to a single sized shaft", () => {
    const m = getManifest("spaceship");
    expect(m).toHaveLength(1);
    expect(m[0].feature_type).toBe("shaft");
    expect(m[0].status).toBe("sized");
  });

  it("every manifest has exactly one sized anchor (no fabricated sized components)", () => {
    for (const type of ["pump", "gear_reducer", "engine", "other"]) {
      const sized = getManifest(type).filter((c) => c.status === "sized");
      expect(sized).toHaveLength(1);
    }
  });
});
