import { toast } from "sonner";

import { listFiles } from "@/lib/api";
import { TOOL_TARGETS } from "@/lib/operations";
import type { Route } from "@/lib/route";

/** Open a catalogue tool: in the Studio on your newest PDF, or the file list when it needs several files. */
export async function launchTool(id: string, navigate: (route: Route) => void): Promise<void> {
  const target = TOOL_TARGETS[id];

  if (!target || target === "files") {
    navigate({ name: "files" });
    toast.message("Add or select the files first, then use the buttons above the list.");

    return;
  }

  try {
    const newest = (await listFiles()).find((file) => file.kind === "pdf" && file.available);

    if (newest) {
      navigate({ name: "studio", file: newest.name, tool: target.tool, mode: target.mode });

      return;
    }
  } catch {
    // Fall through to the file list, which shows the problem.
  }

  navigate({ name: "files" });
  toast.message("Add a PDF first.");
}
