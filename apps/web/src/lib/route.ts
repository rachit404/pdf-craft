"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { ToolCategory } from "@/lib/tools";

/** Where the user is. Kept in the address bar so Back and bookmarks work. */
export type Route =
  | { name: "tools"; category: ToolCategory }
  | { name: "tool"; id: string }
  | { name: "studio"; file: string; tool?: string; mode?: string }
  | { name: "files" }
  | { name: "flows"; id?: string }
  | { name: "settings" };

const CATEGORY_SLUGS: Record<string, ToolCategory> = {
  organize: "Organize",
  edit: "Edit",
  convert: "Convert",
  protect: "Protect",
};

export function parseRoute(hash: string): Route {
  const [section, detail, third, fourth] = hash.replace(/^#\/?/, "").split("/");

  if (section === "studio" && detail) {
    return { name: "studio", file: decodeURIComponent(detail), tool: third, mode: fourth };
  }

  if (section === "tool" && detail) return { name: "tool", id: detail };
  if (section === "files") return { name: "files" };
  if (section === "flows") return { name: "flows", id: detail };
  if (section === "settings") return { name: "settings" };

  return { name: "tools", category: CATEGORY_SLUGS[detail ?? ""] ?? "All tools" };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case "studio":
      return `#/studio/${encodeURIComponent(route.file)}${route.tool ? `/${route.tool}${route.mode ? `/${route.mode}` : ""}` : ""}`;
    case "tool":
      return `#/tool/${route.id}`;
    case "files":
      return "#/files";
    case "flows":
      return route.id ? `#/flows/${route.id}` : "#/flows";
    case "settings":
      return "#/settings";
    case "tools":
      return route.category === "All tools"
        ? "#/tools"
        : `#/tools/${route.category.toLowerCase()}`;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);

  return () => window.removeEventListener("hashchange", onChange);
}

export function useRoute(): [Route, (route: Route) => void] {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );

  const navigate = useCallback((route: Route) => {
    window.location.hash = routeToHash(route);
    window.scrollTo({ top: 0 });
  }, []);

  return [parseRoute(hash), navigate];
}
