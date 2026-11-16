"use client";

import AuthGate from "@/components/auth/AuthGate";
import FilesPage from "@/components/dashboard/FilesPage";
import ToolsPage from "@/components/dashboard/ToolsPage";
import AppShell from "@/components/layout/AppShell";
import SettingsPage from "@/components/settings/SettingsPage";
import { workflows } from "@/components/workflows/registry";
import { useRoute, type Route } from "@/lib/route";

export default function Home() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

function Dashboard() {
  const [route, navigate] = useRoute();
  const toolsHome: Route = { name: "tools", category: "All tools" };

  const Workflow = route.name === "tool" ? workflows[route.id] : undefined;

  return (
    <AppShell route={route} navigate={navigate}>
      {route.name === "files" ? (
        <FilesPage />
      ) : route.name === "settings" ? (
        <SettingsPage onOpenFiles={() => navigate({ name: "files" })} />
      ) : Workflow ? (
        <Workflow onBack={() => navigate(toolsHome)} />
      ) : (
        <ToolsPage
          category={route.name === "tools" ? route.category : "All tools"}
          onCategoryChange={(category) => navigate({ name: "tools", category })}
          onOpenTool={(id) => navigate({ name: "tool", id })}
        />
      )}
    </AppShell>
  );
}
