// DRAFT load ratings — approximate published SKF basic dynamic (C) and static (C0) ratings, N→lbf. PE-VERIFY against the current SKF catalog before any client deliverable.

export interface CatalogBearing {
  designation: string;
  series: string;
  bore_in: number;
  C_lbf: number;
  C0_lbf: number;
}

export const DEEP_GROOVE_BALL: CatalogBearing[] = [
  { designation: "6205", series: "deep-groove ball", bore_in: 0.984,  C_lbf:  3327, C0_lbf:  1754 },
  { designation: "6206", series: "deep-groove ball", bore_in: 1.181,  C_lbf:  4564, C0_lbf:  2518 },
  { designation: "6207", series: "deep-groove ball", bore_in: 1.378,  C_lbf:  6070, C0_lbf:  3440 },
  { designation: "6208", series: "deep-groove ball", bore_in: 1.575,  C_lbf:  7306, C0_lbf:  4271 },
  { designation: "6210", series: "deep-groove ball", bore_in: 1.969,  C_lbf:  8340, C0_lbf:  5216 },
  { designation: "6306", series: "deep-groove ball", bore_in: 1.181,  C_lbf:  6655, C0_lbf:  3597 },
  { designation: "6308", series: "deep-groove ball", bore_in: 1.575,  C_lbf:  9510, C0_lbf:  5395 },
  { designation: "6310", series: "deep-groove ball", bore_in: 1.969,  C_lbf: 14612, C0_lbf:  8543 },
  { designation: "6312", series: "deep-groove ball", bore_in: 2.362,  C_lbf: 18412, C0_lbf: 11690 },
];
