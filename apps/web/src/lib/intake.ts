import { runFlow, type StoredFileInfo } from "@/lib/api";

/** Turn a stored Word or PowerPoint file into a PDF with a one-step flow. Returns the new PDF's stored name. */
export async function officeToPdf(file: StoredFileInfo): Promise<string> {
  const run = await runFlow(
    {
      nodes: [
        { id: "in", op: "source" },
        { id: "convert", op: `${file.kind}_to_pdf` },
        { id: "out", op: "output" },
      ],
      edges: [
        { source: "in", target: "convert" },
        { source: "convert", target: "out" },
      ],
    },
    { in: [file.name] },
  );

  if (!run.files[0]) throw new Error("The conversion made no file.");

  return run.files[0].name;
}
