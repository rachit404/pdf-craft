"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Input, Kbd, Segmented } from "@/components/ui/controls";
import { categories, tools, type ToolCategory } from "@/lib/tools";

interface ToolsPageProps {
  category: ToolCategory;
  onCategoryChange: (category: ToolCategory) => void;
  onOpenTool: (id: string) => void;
}

/** Every tool, grouped and searchable. Press / to search. */
export default function ToolsPage({ category, onCategoryChange, onOpenTool }: ToolsPageProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

      if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();

    return tools.filter(
      (tool) =>
        (category === "All tools" || tool.category === category) &&
        (!text ||
          `${tool.name} ${tool.description} ${tool.category}`.toLowerCase().includes(text)),
    );
  }, [category, query]);

  const groups = categories
    .filter((item) => item !== "All tools")
    .map((item) => ({ name: item, items: visible.filter((tool) => tool.category === item) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-lg font-semibold tracking-tight">
          Tools <span className="ml-1 font-mono text-[0.8rem] font-normal text-fg-subtle">{visible.length}</span>
        </h1>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" strokeWidth={1.75} />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tools"
            aria-label="Search tools"
            className="pl-8 pr-8"
          />
          <Kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">/</Kbd>
        </div>

        <div className="w-full sm:w-auto">
          <Segmented
            label="Category"
            value={category}
            onChange={onCategoryChange}
            options={categories.map((item) => ({ id: item, label: item === "All tools" ? "All" : item }))}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-box border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <p className="font-medium">No tool matches that</p>
          <p className="mt-1 text-[0.85rem] text-fg-subtle">Try a different word, or clear the search.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.name} aria-label={group.name}>
              <h2 className="mb-2 flex items-baseline gap-2 text-[0.75rem] font-semibold uppercase tracking-wide text-fg-muted">
                {group.name}
                <span className="font-mono font-normal normal-case tracking-normal text-fg-subtle">{group.items.length}</span>
              </h2>

              <div className="overflow-hidden rounded-box border border-line bg-surface">
                <ul className="-mb-px columns-1 md:columns-2 xl:columns-3 md:[column-rule:1px_solid_var(--line)]">
                  {group.items.map((tool) => (
                    <li key={tool.id} className="break-inside-avoid">
                      <button
                        type="button"
                        onClick={() => onOpenTool(tool.id)}
                        className="group flex w-full items-start gap-3 border-b border-line px-3.5 py-3 text-left transition-colors hover:bg-hover"
                      >
                        <tool.icon className="mt-0.5 size-4 shrink-0 text-fg-subtle group-hover:text-accent" strokeWidth={1.75} />
                        <span className="min-w-0">
                          <span className="block text-[0.9rem] font-medium">{tool.name}</span>
                          <span className="block text-[0.8rem] leading-snug text-fg-subtle">{tool.description}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
