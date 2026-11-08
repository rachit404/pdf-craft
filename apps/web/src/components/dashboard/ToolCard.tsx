import type { PDFTool } from "@/lib/tools";

interface ToolCardProps {
  tool: PDFTool;
  onClick: (tool: PDFTool) => void;
}

const colorStyles: Record<string, string> = {
  violet: "bg-violet-50 text-violet-600",
  blue: "bg-blue-50 text-blue-600",
  cyan: "bg-cyan-50 text-cyan-600",
  orange: "bg-orange-50 text-orange-600",
  pink: "bg-pink-50 text-pink-600",
  red: "bg-red-50 text-red-600",
};

export default function ToolCard({ tool, onClick }: ToolCardProps) {
  const Icon = tool.icon;

  return (
    <button
      onClick={() => onClick(tool)}
      className="group flex min-h-48 flex-col rounded-2xl border border-gray-200 bg-white p-5 text-left transition duration-200 hover:-translate-y-1 hover:border-violet-200 hover:shadow-lg hover:shadow-gray-200/60"
    >
      <div className="mb-5 flex items-center justify-between">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            colorStyles[tool.color] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          <Icon size={21} strokeWidth={1.8} />
        </div>

        <span className="text-xs font-medium text-gray-400 transition group-hover:text-violet-600">
          Open tool →
        </span>
      </div>

      <h3 className="mb-2 font-semibold text-gray-900">{tool.name}</h3>

      <p className="text-sm leading-6 text-gray-500">{tool.description}</p>
    </button>
  );
}
