/** Black or white, whichever reads better on the given #rrggbb background. */
export function textOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#111' : '#fff';
}

export const UNASSIGNED = '#8a8f98';

// Starting colors offered for new members; anyone can pick any color afterwards.
export const PALETTE = ['#2f7de1', '#e0457b', '#2fa66a', '#f08a24', '#8e5bd8', '#13a3b5', '#d64545', '#b08900'];
