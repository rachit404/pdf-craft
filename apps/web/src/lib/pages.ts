/** Page selections written the way people write them: "1-3, 5". */

export function parsePages(text: string, pageCount: number): number[] | string {
  const numbers = new Set<number>();

  for (const part of text.split(",").map((item) => item.trim()).filter(Boolean)) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);

    if (!match) return `"${part}" is not a page or a range like 2-4.`;

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;

    if (start < 1 || end < start || end > pageCount) {
      return `Pages must be between 1 and ${pageCount}.`;
    }

    for (let page = start; page <= end; page++) numbers.add(page);
  }

  return numbers.size ? [...numbers].sort((a, b) => a - b) : "Enter at least one page.";
}

export function formatPages(pages: number[]): string {
  const sorted = [...pages].sort((a, b) => a - b);
  const parts: string[] = [];

  for (let i = 0; i < sorted.length; ) {
    let j = i;

    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;

    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }

  return parts.join(", ");
}
