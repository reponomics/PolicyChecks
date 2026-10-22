// The PolicyChecks shield, drawn at the left of every badge label in the same
// slot shields.io uses for its `logo` parameter: a 14 px icon, 5 px from the
// left edge, with 3 px between it and the label text. The fill is the badge's
// own "brightgreen" (#4c1) regardless of result, so the mark stays a constant
// brand element next to red or grey messages instead of changing with them.
//
// The path is the outline of the mark in docs/assets/logo/policychecks-mark.svg
// (512-unit box), scaled down here. There is deliberately no check inside it:
// at 14 px a check would read as a status symbol and contradict a "disabled".

export const logoSize = 14;
export const logoPaddingLeft = 5;
export const logoPaddingRight = 3;

/** Extra label width needed to make room for the logo. */
export const logoWidth = logoSize + logoPaddingRight;

const shieldPath = "M256 56 L420 110 V246 C420 350 350 420 256 458 C162 420 92 350 92 246 V110 Z";

export function renderLogo(fill = "#4c1"): string {
  const scale = logoSize / 512;
  return `<g transform="translate(${logoPaddingLeft} 3) scale(${scale})"><path d="${shieldPath}" fill="${fill}"/></g>`;
}
