// Sprint 30L (foundation) — Component manifest.
//
// A deterministic, per-project-type declaration of WHICH components an assembly of
// that type contains. This is NOT AI decomposition — it is a static skeleton that
// the project-type classifier (Sprint 30M) and the real composer (Sprint 30L-2)
// will later fill in with sized geometry.
//
// The shaft is always the SIZED anchor (Sprint 30I-core produces real shaft geometry).
// Every other component is a DECLARED slot — an honest placeholder awaiting a real
// calc-engine sizing path in 30L-2. We deliberately do NOT fabricate parameters for
// components we have not actually sized; a declared slot carries only its identity.

export type ComponentStatus = "sized" | "declared";

export interface ComponentSpec {
  /** shaft | bearing | impeller | housing | coupling | gear | ... */
  feature_type: string;
  /** Human label, e.g. "Drive-end Bearing". */
  name: string;
  /** sized = real geometry exists; declared = slot awaiting Sprint 30L-2. */
  status: ComponentStatus;
  /** Stable ordering within the assembly. */
  order_index: number;
}

// Manifests are intentionally small and honest. They grow as each component class
// gets a real calc path in 30L-2 (e.g. bearing → ISO 281, impeller → affinity laws).
const MANIFESTS: Record<string, ComponentSpec[]> = {
  pump: [
    { feature_type: "shaft", name: "Pump Shaft", status: "sized", order_index: 0 },
    { feature_type: "bearing", name: "Drive-end Bearing", status: "declared", order_index: 1 },
    { feature_type: "bearing", name: "Non-drive Bearing", status: "declared", order_index: 2 },
    { feature_type: "impeller", name: "Impeller", status: "declared", order_index: 3 },
    { feature_type: "housing", name: "Pump Housing", status: "declared", order_index: 4 },
  ],
  gear_reducer: [
    { feature_type: "shaft", name: "Input Shaft", status: "sized", order_index: 0 },
    { feature_type: "shaft", name: "Output Shaft", status: "declared", order_index: 1 },
    { feature_type: "gear", name: "Pinion", status: "declared", order_index: 2 },
    { feature_type: "gear", name: "Gear", status: "declared", order_index: 3 },
    { feature_type: "bearing", name: "Bearing Set", status: "declared", order_index: 4 },
    { feature_type: "housing", name: "Gearbox Housing", status: "declared", order_index: 5 },
  ],
  engine: [
    { feature_type: "shaft", name: "Crankshaft", status: "sized", order_index: 0 },
    { feature_type: "bearing", name: "Main Bearings", status: "declared", order_index: 1 },
  ],
  // Project types without a richer manifest fall back to a single sized shaft.
};

const DEFAULT_MANIFEST: ComponentSpec[] = [
  { feature_type: "shaft", name: "Shaft", status: "sized", order_index: 0 },
];

/** Return the component manifest for a project type (default = single sized shaft). */
export function getManifest(projectType: string): ComponentSpec[] {
  return MANIFESTS[projectType] ?? DEFAULT_MANIFEST;
}
