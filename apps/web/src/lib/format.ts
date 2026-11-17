/** Human-friendly time and size strings. */

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  // The server sends UTC without a zone marker.
  const then = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
  const minutes = Math.max(0, Math.round((now - then) / 60000));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;

  return `${Math.round(minutes / (60 * 24))} d ago`;
}

/** Time until an expiry, and whether it is close (under two hours). */
export function timeLeft(
  iso: string | null,
  now = Date.now(),
): { text: string; soon: boolean } {
  if (!iso) return { text: "kept", soon: false };

  const end = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
  const minutes = Math.round((end - now) / 60000);

  if (minutes <= 0) return { text: "expiring", soon: true };
  if (minutes < 60) return { text: `${minutes} min`, soon: true };

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return {
    text: hours >= 48 ? `${Math.round(hours / 24)} d` : `${hours} h ${rest} m`,
    soon: minutes < 120,
  };
}

/** The name to show for a stored file. A PDF made from a Word file or an image keeps its source's name, so give it a .pdf ending. */
export function fileLabel(file: { original_name: string; kind: string }): string {
  if (file.kind !== "pdf" || /\.pdf$/i.test(file.original_name)) return file.original_name;

  return `${file.original_name.replace(/\.[^.]+$/, "")}.pdf`;
}
