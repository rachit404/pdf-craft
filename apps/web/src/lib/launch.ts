import type { Route } from "@/lib/route";

/** Open a tool on its own page, where you choose or upload the file it works on. */
export function launchTool(id: string, navigate: (route: Route) => void): void {
  navigate({ name: "tool", id });
}
