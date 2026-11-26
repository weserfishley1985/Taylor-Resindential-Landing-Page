// Stabilize a geometry result at a whole inch only within the caller's
// coordinate noise tolerance. Keep all measurable fractions for grouping.
export function measuredPanelInches(inches, tolerance = 1e-8) {
  const whole = Math.round(inches);
  return Math.abs(inches - whole) <= tolerance ? whole : inches;
}

// Call once per roof plane or wall. Blanks are in inches here; the planner's
// public panel.length and maximum stock setting are both in feet.
export function standardizePanelLengths(panels, {enabled = false, maxLengthFeet = Infinity} = {}) {
  if (!(maxLengthFeet > 0)) throw Error('Maximum stock length must be positive.');
  for (const panel of panels) {
    const raw = panel.rawLengthInches;
    if (!Number.isFinite(raw) || raw < 0) throw Error('Invalid required panel length.');
    panel.length = Math.ceil(raw) / 12;
    panel.oversize = panel.length > maxLengthFeet;
  }
  if (!enabled || panels.length < 2) return panels;

  // Keep panel/strip order for drawing and identification. Anchoring each
  // group at its shortest original blank excludes transitive matches.
  const sorted = [...panels].sort((a, b) => a.rawLengthInches - b.rawLengthInches);
  let start = 0;
  while (start < sorted.length) {
    const first = sorted[start];
    let end = start + 1;
    while (end < sorted.length && sorted[end].rawLengthInches <= first.rawLengthInches + 1 &&
           sorted[end].oversize === first.oversize) end++;
    const commonFeet = Math.ceil(sorted[end - 1].rawLengthInches) / 12;
    for (let i = start; i < end; i++) sorted[i].length = commonFeet;
    start = end;
  }
  return panels;
}
