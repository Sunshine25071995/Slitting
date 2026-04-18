export function calculateNetWeight(grossWeight: number, coreWeight: number): number {
  return Math.max(0, grossWeight - coreWeight);
}

export function calculateMeter(netWeight: number, micron: number, coilSize: number): number {
  if (micron === 0 || coilSize === 0) return 0;
  // Formula: Meter = (Net Weight / Micron / 0.00139 / Coil Size) * 1000
  const meter = (netWeight / micron / 0.00139 / coilSize) * 1000;
  return Math.floor(Math.max(0, meter));
}
