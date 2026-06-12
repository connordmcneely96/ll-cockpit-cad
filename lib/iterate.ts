// Shaft convergence loop (Sprint 30I-core).
// Holds duty loads fixed (from generateShaft) and varies the DIAMETER, re-running
// the three checks (stress / deflection / critical-speed) until all pass or limits hit.
//
// Check mapping is replicated exactly from engineering-calcs /api/shafts/analyze,
// but with a CONTROLLED diameter instead of the generator's:
//   stress:        {diameter, torque, bendingMoment, axialLoad:0, material}
//   deflection:    {diameter, length: bearingSpan, load: radialLoad, position: overhang,
//                   material, supportType:'cantilevered'}
//   critical-speed:{diameter, length: bearingSpan, material, supportType:'simply-supported',
//                   overhangMass: radialLoad/386.4, overhangDistance: overhang,
//                   operatingSpeed: speed}
//
// Sizing rules (from old-repo PrimaryDesignAgent): bump the diameter by the MAX
// applicable factor for failed checks (stress 1.10, deflection 1.15, critical 1.20),
// round UP to the nearest 1/8", hard cap at 6.0" (escalate if still failing at cap).

import {
  generateShaft,
  checkStress,
  checkDeflection,
  checkCriticalSpeed,
  type CalcEnv,
  type CheckResult,
} from "./calcs";

export interface ShaftBrief {
  power: number;
  speed: number;
  overhang: number;
  bearingSpan: number;
  material: string;
  applicationFactor?: number;
  head?: number;
  impellerDiameter?: number;
  impellerWidth?: number;
  specificGravity?: number;
  casingType?: "single_volute" | "double_volute" | "diffuser" | "concentric";
}

export interface IterationEntry {
  iteration: number;
  diameter: number;
  stressPassed: boolean;
  deflectionPassed: boolean;
  criticalSpeedPassed: boolean;
}

export interface IterateResult {
  converged: boolean;
  totalIterations: number;
  finalDiameter: number;
  gen: {
    torque: number;
    radialLoad: number;
    bendingMoment: number;
    material: string;
    initialDiameter: number;
  };
  finalChecks: {
    stress: CheckResult;
    deflection: CheckResult;
    critical: CheckResult;
  };
  iterations: IterationEntry[];
}

const G_IN_PER_S2 = 386.4; // gravitational constant, in/s^2 (US customary mass conversion)
const MAX_DIAMETER = 6.0; // manufacturing cap, inches
const BUMP_STRESS = 1.10;
const BUMP_DEFLECTION = 1.15;
const BUMP_CRITICAL = 1.20;

/** Round a diameter UP to the nearest 1/8 inch. */
function roundUpEighth(d: number): number {
  return Math.ceil(d * 8) / 8;
}

export async function iterate(
  env: CalcEnv,
  brief: ShaftBrief,
  maxIterations = 5
): Promise<IterateResult> {
  const gen = await generateShaft(env, brief);

  // Duty loads are fixed by the spec; only the diameter varies.
  const { torque, radialLoad, bendingMoment, material } = gen;
  let diameter = gen.diameter;

  const iterations: IterationEntry[] = [];
  let stress!: CheckResult;
  let deflection!: CheckResult;
  let critical!: CheckResult;
  let converged = false;

  for (let i = 1; i <= maxIterations; i++) {
    stress = await checkStress(env, {
      diameter,
      torque,
      bendingMoment,
      axialLoad: 0,
      material,
    });

    deflection = await checkDeflection(env, {
      diameter,
      length: brief.bearingSpan,
      load: radialLoad,
      position: brief.overhang,
      material,
      supportType: "cantilevered",
    });

    critical = await checkCriticalSpeed(env, {
      diameter,
      length: brief.bearingSpan,
      material,
      supportType: "simply-supported",
      overhangMass: radialLoad / G_IN_PER_S2,
      overhangDistance: brief.overhang,
      operatingSpeed: brief.speed,
    });

    iterations.push({
      iteration: i,
      diameter,
      stressPassed: stress.passed,
      deflectionPassed: deflection.passed,
      criticalSpeedPassed: critical.passed,
    });

    if (stress.passed && deflection.passed && critical.passed) {
      converged = true;
      break;
    }

    // Most-conservative bump across the failed checks.
    let bump = 1.0;
    if (!stress.passed) bump = Math.max(bump, BUMP_STRESS);
    if (!deflection.passed) bump = Math.max(bump, BUMP_DEFLECTION);
    if (!critical.passed) bump = Math.max(bump, BUMP_CRITICAL);

    const nextD = Math.min(roundUpEighth(diameter * bump), MAX_DIAMETER);

    // At the manufacturing cap and still failing -> escalate (converged stays false).
    if (diameter >= MAX_DIAMETER) break;

    diameter = nextD;
  }

  return {
    converged,
    totalIterations: iterations.length,
    finalDiameter: diameter,
    gen: {
      torque,
      radialLoad,
      bendingMoment,
      material,
      initialDiameter: gen.diameter,
    },
    finalChecks: { stress, deflection, critical },
    iterations,
  };
}
