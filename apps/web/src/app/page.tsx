"use client";

import { useMemo, useState } from "react";
import { ArrowRight, FileText, Search } from "lucide-react";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import ToolCard from "@/components/dashboard/ToolCard";
import MergeWorkflow from "@/components/workflows/MergeWorkflow";
import SplitWorkflow from "@/components/workflows/SplitWorkflow";
import ExtractWorkflow from "@/components/workflows/ExtractWorkflow";

import { tools, type PDFTool, type ToolCategory } from "@/lib/tools";

export default function Home() {
  const [activeCategory, setActiveCategory] =
    useState<ToolCategory>("All tools");

  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<PDFTool | null>(null);

  const filteredTools = useMemo(() => {
    return tools.filter((tool) => {
      const matchesCategory =
        activeCategory === "All tools" || tool.category === activeCategory;

      const query = search.trim().toLowerCase();

      const matchesSearch =
        !query ||
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query) ||
        tool.category.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, search]);

  const categoryCounts = {
    Organize: tools.filter((tool) => tool.category === "Organize").length,
    Edit: tools.filter((tool) => tool.category === "Edit").length,
    Convert: tools.filter((tool) => tool.category === "Convert").length,
    Protect: tools.filter((tool) => tool.category === "Protect").length,
  };

  function handleToolClick(tool: PDFTool) {
    setSelectedTool(tool);
  }

  function handleBackToDashboard() {
    setSelectedTool(null);
  }

  if (selectedTool) {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        {selectedTool.id === "merge" ? (
          <MergeWorkflow onBack={handleBackToDashboard} />
        ) : selectedTool.id === "split" ? (
          <SplitWorkflow onBack={handleBackToDashboard} />
        ) : selectedTool.id === "extract" ? (
          <ExtractWorkflow onBack={handleBackToDashboard} />
        ) : (
          <main className="mx-auto max-w-2xl px-6 py-24 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
              <selectedTool.icon size={25} />
            </div>

            <h2 className="text-2xl font-bold text-gray-900">
              {selectedTool.name}
            </h2>

            <p className="mt-3 text-sm text-gray-500">
              {selectedTool.description}
            </p>

            <p className="mt-2 text-sm text-gray-400">
              This workflow will be implemented in an upcoming batch.
            </p>

            <button
              onClick={handleBackToDashboard}
              className="mt-6 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Back to dashboard
            </button>
          </main>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#fafafa]">
      <Sidebar
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          search={search}
          onSearchChange={setSearch}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-5 py-8 sm:px-8 lg:px-10">
          <section className="mb-10 overflow-hidden rounded-3xl bg-gray-900 px-7 py-9 text-white sm:px-10 sm:py-11">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-gray-200">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Your documents. Your machine.
              </div>

              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Everything you need
                <br />
                to work with PDFs.
              </h1>

              <p className="mt-4 max-w-lg text-sm leading-7 text-gray-300 sm:text-base">
                Merge, edit, convert and protect your documents with one simple
                workspace. Private, efficient and self-hosted.
              </p>

              <button
                onClick={() => {
                  setActiveCategory("All tools");
                  setSearch("");
                }}
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-100"
              >
                Explore all tools
                <ArrowRight size={16} />
              </button>
            </div>
          </section>

          <section className="mb-9">
            <div className="mb-5">
              <h2 className="text-xl font-bold tracking-tight text-gray-900">
                Quick access
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Browse tools by what you want to accomplish.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                Object.entries(categoryCounts) as [
                  Exclude<ToolCategory, "All tools">,
                  number,
                ][]
              ).map(([category, count]) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`rounded-2xl border p-4 text-left transition hover:shadow-sm ${
                    activeCategory === category
                      ? "border-violet-300 bg-violet-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {category}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">{count} tools</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-gray-900">
                  {activeCategory === "All tools"
                    ? "All PDF tools"
                    : `${activeCategory} tools`}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {filteredTools.length} tools available
                </p>
              </div>

              <button
                onClick={() => {
                  setActiveCategory("All tools");
                  setSearch("");
                }}
                className="text-sm font-medium text-violet-600 hover:text-violet-700"
              >
                View all
              </button>
            </div>

            {filteredTools.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredTools.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    onClick={handleToolClick}
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-5 text-center">
                <div className="mb-4 rounded-2xl bg-gray-100 p-4">
                  {search ? (
                    <Search className="text-gray-500" size={24} />
                  ) : (
                    <FileText className="text-gray-500" size={24} />
                  )}
                </div>

                <h3 className="font-semibold text-gray-900">No tools found</h3>

                <p className="mt-2 text-sm text-gray-500">
                  Try another search or select a different category.
                </p>

                <button
                  onClick={() => {
                    setSearch("");
                    setActiveCategory("All tools");
                  }}
                  className="mt-4 text-sm font-semibold text-violet-600 hover:text-violet-700"
                >
                  Clear filters
                </button>
              </div>
            )}
          </section>

          <footer className="mt-14 border-t border-gray-200 py-6 text-center text-xs text-gray-400">
            PDF Craft · Local-first document processing
          </footer>
        </main>
      </div>
    </div>
  );
}
