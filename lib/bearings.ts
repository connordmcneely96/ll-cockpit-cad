import { DEEP_GROOVE_BALL, type CatalogBearing } from "./bearing-catalog";
import { bearingLife, type BearingLifeResult, type CalcEnv } from "./calcs";

export function computeOverhungReactions(
  radialLoad: number,
  overhang: number,
  bearingSpan: number
): { driveEnd: number; nonDrive: number } {
  if (bearingSpan <= 0) throw new Error("bearingSpan must be > 0");
  return {
    driveEnd: radialLoad * (bearingSpan + overhang) / bearingSpan,
    nonDrive: radialLoad * overhang / bearingSpan,
  };
}

export type BearingSelection =
  | { bearing: CatalogBearing; life: BearingLifeResult }
  | { bearing: null; reason: string };

export async function selectBearing(
  env: CalcEnv,
  a: {
    shaftDiameter: number;
    appliedRadialLoad: number;
    speed: number;
    targetLifeHours: number;
  }
): Promise<BearingSelection> {
  const candidates = DEEP_GROOVE_BALL
    .filter((b) => b.bore_in >= a.shaftDiameter)
    .sort((x, y) => x.C_lbf - y.C_lbf);

  if (candidates.length === 0) {
    return {
      bearing: null,
      reason: "Shaft diameter exceeds bearing catalog max bore; manual selection required",
    };
  }

  for (const c of candidates) {
    const life = await bearingLife(env, {
      Fr: a.appliedRadialLoad,
      C: c.C_lbf,
      C0: c.C0_lbf,
      speed: a.speed,
      bearingType: "ball",
      requiredLifeHours: a.targetLifeHours,
    });
    if (life.passed === true) {
      return { bearing: c, life };
    }
  }

  return {
    bearing: null,
    reason: "Required dynamic capacity exceeds catalog at this load and speed; manual selection required",
  };
}
