"use client";

import dynamic from "next/dynamic";

import AuthGate from "@/components/auth/AuthGate";
import FilesPage from "@/components/dashboard/FilesPage";
import ToolsPage from "@/components/dashboard/ToolsPage";
import AppShell from "@/components/layout/AppShell";
import SettingsPage from "@/components/settings/SettingsPage";
import StudioPage from "@/components/studio/StudioPage";
import { launchTool } from "@/lib/launch";
import { useRoute } from "@/lib/route";

// The flow canvas and its library are only loaded when Flows is opened.
const FlowsPage = dynamic(() => import("@/components/flows/FlowsPage"), {
  ssr: false,
  loading: () => <p className="p-6 text-[0.85rem] text-fg-subtle">Loading the canvas...</p>,
});

export default function Home() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

function Dashboard() {
  const [route, navigate] = useRoute();
  const openTool = (id: string) => void launchTool(id, navigate);

  return (
    <AppShell route={route} navigate={navigate} onOpenTool={openTool}>
      {route.name === "studio" ? (
        <StudioPage key={route.file} file={route.file} tool={route.tool} mode={route.mode} navigate={navigate} />
      ) : route.name === "flows" ? (
        <FlowsPage key={route.id ?? "new"} navigate={navigate} openId={route.id} />
      ) : route.name === "files" ? (
        <FilesPage navigate={navigate} />
      ) : route.name === "settings" ? (
        <SettingsPage onOpenFiles={() => navigate({ name: "files" })} />
      ) : (
        <ToolsPage
          category={route.category}
          onCategoryChange={(category) => navigate({ name: "tools", category })}
          onOpenTool={openTool}
        />
      )}
    </AppShell>
  );
}
