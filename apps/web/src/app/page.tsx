"use client";

import AuthGate from "@/components/auth/AuthGate";
import FilesPage from "@/components/dashboard/FilesPage";
import FlowsPage from "@/components/flows/FlowsPage";
import ToolsPage from "@/components/dashboard/ToolsPage";
import AppShell from "@/components/layout/AppShell";
import SettingsPage from "@/components/settings/SettingsPage";
import StudioPage from "@/components/studio/StudioPage";
import { launchTool } from "@/lib/launch";
import { useRoute } from "@/lib/route";

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
        <FlowsPage navigate={navigate} />
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
