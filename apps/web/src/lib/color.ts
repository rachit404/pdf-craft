/** Small colour helpers used by the theme system. No dependencies. */

export type RGB = [number, number, number];

export function parseHex(value: string): RGB | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());

  if (!match) return null;

  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : match[1];

  return [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16)) as RGB;
}

export function toHex([red, green, blue]: RGB): string {
  return (
    "#" +
    [red, green, blue]
      .map((channel) =>
        Math.round(Math.min(255, Math.max(0, channel)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

/** Relative luminance as defined by WCAG. */
export function luminance(rgb: RGB): number {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours (1 to 21). */
export function contrast(first: string, second: string): number {
  const a = parseHex(first);
  const b = parseHex(second);

  if (!a || !b) return 1;

  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (light + 0.05) / (dark + 0.05);
}

/** `weight` of the first colour mixed with the rest of the second, in sRGB. */
export function mix(first: string, second: string, weight: number): string {
  const a = parseHex(first) ?? [0, 0, 0];
  const b = parseHex(second) ?? [255, 255, 255];

  return toHex([0, 1, 2].map((i) => a[i] * weight + b[i] * (1 - weight)) as RGB);
}

/** White or near-black, whichever is easier to read on `background`. */
export function readableOn(background: string): string {
  return contrast(background, "#FFFFFF") >= contrast(background, "#0B1220")
    ? "#FFFFFF"
    : "#0B1220";
}
