// Typed client for the engineering-calcs worker, called via the CALCS service binding.
// Envelope: { success: true, result: T } | { success: false, error: { code, message } }
// Hostname in the URL is arbitrary for service bindings (routed internally) — use https://calcs.

export interface ShaftGenerateResult {
  diameter: number;
  length: number;
  material: string;
  torque: number;
  radialLoad: number;
  bendingMoment: number;
  features: unknown[];
}

export interface CheckResult {
  passed: boolean;
  [k: string]: unknown;
}

export type CalcEnv = {
  CALCS: { fetch: (req: Request) => Promise<Response> };
  CALC_SECRET?: string;
};

async function calcPost<T>(env: CalcEnv, path: string, body: unknown): Promise<T> {
  const res = await env.CALCS.fetch(
    new Request(`https://calcs${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Calc-Secret": env.CALC_SECRET ?? "",
      },
      body: JSON.stringify(body),
    })
  );

  const json = (await res.json()) as
    | { success: true; result: T }
    | { success: false; error: { code: string; message: string } };

  if (!json.success) {
    throw new Error(
      `engineering-calcs ${path} failed: ${json.error.code} ${json.error.message}`
    );
  }
  return json.result;
}

export function generateShaft(
  env: CalcEnv,
  p: {
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
): Promise<ShaftGenerateResult> {
  return calcPost<ShaftGenerateResult>(env, "/api/shafts/generate", p);
}

export function checkStress(
  env: CalcEnv,
  p: {
    diameter: number;
    torque: number;
    bendingMoment: number;
    axialLoad: number;
    material: string;
  }
): Promise<CheckResult> {
  return calcPost<CheckResult>(env, "/api/shafts/stress", p);
}

export function checkDeflection(
  env: CalcEnv,
  p: {
    diameter: number;
    length: number;
    load: number;
    position: number;
    material: string;
    supportType: string;
  }
): Promise<CheckResult> {
  return calcPost<CheckResult>(env, "/api/shafts/deflection", p);
}

export function checkCriticalSpeed(
  env: CalcEnv,
  p: {
    diameter: number;
    length: number;
    material: string;
    supportType: string;
    overhangMass: number;
    overhangDistance: number;
    operatingSpeed: number;
  }
): Promise<CheckResult> {
  return calcPost<CheckResult>(env, "/api/shafts/critical-speed", p);
}

export interface BearingLifeResult {
  equivalentLoad: number;
  basicRatingLife_Mrev: number;
  basicRatingLife_hours: number;
  adjustedLife_hours: number;
  staticSafetyFactor: number | null;
  requiredLifeHours: number | null;
  passed: boolean | null;
  a1: number;
  bearingType: "ball" | "roller";
  formula: string;
  reference: string;
}

export function bearingLife(
  env: CalcEnv,
  p: {
    Fr: number;
    Fa?: number;
    C: number;
    speed: number;
    bearingType: "ball" | "roller";
    C0?: number;
    requiredLifeHours?: number;
  }
): Promise<BearingLifeResult> {
  return calcPost<BearingLifeResult>(env, "/api/bearings/life", p);
}
