"use client";

import {
  FileText,
  LayoutDashboard,
  Clock3,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";

import { categories, type ToolCategory } from "@/lib/tools";

interface SidebarProps {
  activeCategory: ToolCategory;
  onCategoryChange: (category: ToolCategory) => void;
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({
  activeCategory,
  onCategoryChange,
  open,
  onClose,
}: SidebarProps) {
  return (
    <>
      {open && (
        <button
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-white">
              <FileText size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">
              pdf<span className="text-violet-600">craft</span>
            </span>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={19} />
          </button>
        </div>

        <div className="px-4 pt-5">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Workspace
          </p>

          <button
            onClick={() => {
              onCategoryChange("All tools");
              onClose();
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
              activeCategory === "All tools"
                ? "bg-violet-50 text-violet-700"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <LayoutDashboard size={18} />
            All tools
          </button>

          <div className="mb-3 mt-8 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Categories
          </div>

          <nav className="space-y-1">
            {categories
              .filter((category) => category !== "All tools")
              .map((category) => (
                <button
                  key={category}
                  onClick={() => {
                    onCategoryChange(category);
                    onClose();
                  }}
                  className={`flex w-full items-center rounded-xl px-3 py-3 text-sm font-medium transition ${
                    activeCategory === category
                      ? "bg-violet-50 text-violet-700"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {category}
                </button>
              ))}
          </nav>
        </div>

        <div className="mt-auto space-y-1 border-t border-gray-100 p-4">
          <button
            onClick={() => onCategoryChange("All tools")}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Clock3 size={18} />
            Recent activity
          </button>

          <button
            onClick={() => onCategoryChange("All tools")}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Settings size={18} />
            Settings
          </button>

          <div className="mt-4 rounded-xl bg-gray-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <ShieldCheck size={17} className="text-emerald-600" />
              Privacy first
            </div>
            <p className="text-xs leading-5 text-gray-500">
              Your documents are processed locally on your own server.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
