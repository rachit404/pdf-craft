"use client";

import { Menu, Search, X } from "lucide-react";

interface HeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  onMenuClick: () => void;
}

export default function Header({
  search,
  onSearchChange,
  onMenuClick,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-gray-200 bg-white/90 px-5 backdrop-blur-md sm:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
        >
          <Menu size={21} />
        </button>

        <div className="relative w-full max-w-md">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search PDF tools..."
            className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-10 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
          />

          {search && (
            <button
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="ml-4 hidden items-center gap-3 sm:flex">
        <span className="text-xs font-medium text-gray-500">
          Local PDF workspace
        </span>
        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </div>
    </header>
  );
}
