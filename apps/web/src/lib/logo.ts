import { mix } from "./color";

/** The colours the mark is painted with. Any CSS colour works; the browser tab icon needs plain hex. */
export interface LogoColours {
  /** Top of the tile. */
  top: string;
  /** Bottom of the tile. */
  bottom: string;
  /** The folded corner. */
  fold: string;
  /** The lines of text on the page. */
  ink: string;
}

/** Colours that follow whichever theme is active, for artwork drawn inside the page. */
export const LIVE_COLOURS: LogoColours = {
  top: "color-mix(in srgb, var(--accent) 85%, #fff)",
  bottom: "color-mix(in srgb, var(--accent) 75%, #000)",
  fold: "color-mix(in srgb, var(--accent) 28%, #fff)",
  ink: "color-mix(in srgb, var(--accent) 72%, #000)",
};

/** The same colours as plain hex for one accent, for places that cannot read the page's CSS (the tab icon). */
export function coloursFor(accent: string): LogoColours {
  return {
    top: mix(accent, "#FFFFFF", 0.85),
    bottom: mix(accent, "#000000", 0.75),
    fold: mix(accent, "#FFFFFF", 0.28),
    ink: mix(accent, "#000000", 0.72),
  };
}

/** The PDF Craft mark: a page with a folded corner and a spark, on a tile. One drawing used everywhere. */
export function logoSvg(colours: LogoColours, id = "pc-logo"): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">` +
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" style="stop-color:${colours.top}"/><stop offset="1" style="stop-color:${colours.bottom}"/>` +
    `</linearGradient></defs>` +
    `<rect width="32" height="32" rx="8" fill="url(#${id})"/>` +
    `<path d="M10 5.5h8.2l5.8 5.8V24a2.5 2.5 0 0 1-2.5 2.5h-11.5A2.5 2.5 0 0 1 7.5 24V8A2.5 2.5 0 0 1 10 5.5z" fill="#fff"/>` +
    `<path d="M18.2 5.5v4a1.8 1.8 0 0 0 1.8 1.8h4z" style="fill:${colours.fold}"/>` +
    `<rect x="10.5" y="14" width="9" height="2" rx="1" style="fill:${colours.ink}"/>` +
    `<rect x="10.5" y="18.2" width="6" height="2" rx="1" style="fill:${colours.ink}" opacity=".5"/>` +
    `<path d="M23 17.2l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" fill="#FFC24B" stroke="#fff" stroke-width="1" stroke-linejoin="round" paint-order="stroke"/>` +
    `</svg>`
  );
}

/** Repaint the browser tab icon for a theme, so it matches the page. */
export function setTabIcon(accent: string): void {
  const href = `data:image/svg+xml,${encodeURIComponent(logoSvg(coloursFor(accent), "pc-tab"))}`;
  let links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];

  if (links.length === 0) {
    const link = document.createElement("link");

    link.rel = "icon";
    document.head.appendChild(link);
    links = [link];
  }

  for (const link of links) {
    link.type = "image/svg+xml";
    link.removeAttribute("sizes");
    link.href = href;
  }
}
