import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppWindow,
  ExternalLink,
  FolderPlus,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Wrench,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { useDashboard } from "@/hooks/use-dashboard";
import { deleteCustomTool, reorderTools, setToolEnabled, upsertCustomTool } from "@/lib/api";
import type { SkillInfo, ToolInfo } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { SkillsView } from "@/views/SkillsView";
import { ToolsView } from "@/views/ToolsView";
import { MarketplaceView } from "@/views/MarketplaceView";
import { SettingsView } from "@/views/SettingsView";
import { SkillEditorDialog } from "@/components/SkillEditorDialog";
import { CustomToolDialog } from "@/components/CustomToolDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ViewKey = "skills" | "tools" | "marketplace" | "settings";

const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: typeof Sparkles }> = [
  { key: "skills", label: "Skills", icon: Sparkles },
  { key: "marketplace", label: "Find Skills", icon: ShoppingBag },
  { key: "tools", label: "Tools", icon: Wrench },
  { key: "settings", label: "Settings", icon: Settings },
];

interface SkillEditorState {
  open: boolean;
  mode: "create" | "edit";
  source?: SkillInfo;
}

function App() {
  const { data, loading, refresh } = useDashboard();
  const [view, setView] = useState<ViewKey>("skills");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<SkillEditorState>({ open: false, mode: "create" });
  const [customToolOpen, setCustomToolOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [appVersion, setAppVersion] = useState(__APP_VERSION__);

  useEffect(() => {
    void (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setAppVersion(await getVersion());
      } catch {
        setAppVersion(__APP_VERSION__);
      }
    })();
  }, []);

  useEffect(() => {
    setSearch("");
  }, [view]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void refresh();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refresh]);

  const filteredSkills = useMemo(() => {
    if (!data) {
      return [];
    }
    if (!search.trim()) {
      return data.skills;
    }
    const query = search.toLowerCase();
    return data.skills.filter((skill) => {
      return (
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.enabledFor.join(" ").toLowerCase().includes(query)
      );
    });
  }, [data, search]);

  const onToggleTool = useCallback(
    async (tool: ToolInfo, enabled: boolean) => {
      try {
        await setToolEnabled(tool.id, enabled);
        toast.success(`${tool.name} is now ${enabled ? "enabled" : "disabled"}`);
        await refresh();
      } catch (error) {
        toast.error(`Failed to update tool: ${String(error)}`);
      }
    },
    [refresh],
  );

  const openExternal = useCallback(async (url: string) => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const searchPlaceholder = view === "skills" ? "Search skills" : view === "tools" ? "Search tools" : null;

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <SidebarProvider>
        <Sidebar variant="inset">
          <SidebarHeader>
            <div className="flex items-center gap-3 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 py-2">
              <div className="rounded-md bg-sidebar-primary p-2 text-sidebar-primary-foreground">
                <AppWindow className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">SkillsYoga</p>
                <p className="text-xs text-muted-foreground">Desktop Skill Hub</p>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          isActive={view === item.key}
                          onClick={() => setView(item.key)}
                          tooltip={item.label}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <Button
              variant="ghost"
              className="h-8 justify-start rounded-md border border-sidebar-border px-3 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setAboutOpen(true)}
            >
              v{appVersion}
            </Button>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-w-0 overflow-hidden">
          <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
            <div className="mx-auto flex h-[72px] w-full max-w-[1680px] items-center justify-between px-4 md:px-8">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <h1 className="text-lg font-semibold">{NAV_ITEMS.find((item) => item.key === view)?.label}</h1>
              </div>
              <div className="flex items-center gap-2">
                {searchPlaceholder && (
                  <div className="relative w-60">
                    <Search className="pointer-events-none absolute top-2.5 left-2 size-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.currentTarget.value)}
                      className="pl-8"
                      placeholder={searchPlaceholder}
                    />
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={() => void refresh()}>
                  <RefreshCw className={cn("size-4", loading && "animate-spin")} />
                  Refresh
                </Button>
                {view === "skills" && (
                  <Button size="sm" onClick={() => setEditor({ open: true, mode: "create" })}>
                    <Plus className="size-4" />
                    New Skill
                  </Button>
                )}
                {view === "tools" && (
                  <Button size="sm" onClick={() => setCustomToolOpen(true)}>
                    <FolderPlus className="size-4" />
                    Add Custom Tool
                  </Button>
                )}
              </div>
            </div>
          </header>

          <main className="mx-auto w-full min-w-0 max-w-[1680px] space-y-5 p-4 md:p-8">
            {view === "skills" && (
              <SkillsView
                installedCount={data?.stats.installedSkills ?? 0}
                loading={loading}
                skills={filteredSkills}
                onEdit={(skill) => setEditor({ open: true, mode: "edit", source: skill })}
              />
            )}
            {view === "tools" && data && (
              <ToolsView
                tools={data.tools}
                query={search}
                onToggle={onToggleTool}
                onDeleteCustom={async (toolId) => {
                  await deleteCustomTool(toolId);
                  toast.success("Custom tool removed");
                  await refresh();
                }}
                onReorder={async (toolOrder) => {
                  try {
                    await reorderTools(toolOrder);
                    await refresh();
                  } catch (error) {
                    toast.error(`Failed to reorder tools: ${String(error)}`);
                  }
                }}
              />
            )}
            {view === "marketplace" && data && (
              <MarketplaceView
                sources={data.sources}
                tools={data.tools}
                onInstalled={async () => {
                  await refresh();
                }}
              />
            )}
            {view === "settings" && data && (
              <SettingsView
                appDataDir={data.appDataDir}
                installedSkills={data.stats.installedSkills}
                enabledTools={data.stats.enabledTools}
              />
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>

      {data && (
        <SkillEditorDialog
          open={editor.open}
          mode={editor.mode}
          skill={editor.source}
          tools={data.tools}
          onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
          onSaved={async () => {
            await refresh();
          }}
        />
      )}

      <CustomToolDialog
        open={customToolOpen}
        onOpenChange={setCustomToolOpen}
        onSaved={async (tool) => {
          await upsertCustomTool(tool);
          toast.success("Custom tool saved");
          await refresh();
        }}
      />

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>SkillsYoga</DialogTitle>
            <DialogDescription>v{appVersion}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => void openExternal("https://skills.yoga")}
            >
              Official Website
              <ExternalLink className="size-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => void openExternal("https://xnu.app")}
            >
              XNU Apps
              <ExternalLink className="size-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => void openExternal("https://microclaw.ai")}
            >
              MicroClaw
              <ExternalLink className="size-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
