import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppWindow,
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
import {
  deleteCustomTool,
  reorderTools,
  setToolEnabled,
  upsertCustomTool,
} from "@/lib/api";
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

type ViewKey = "skills" | "tools" | "marketplace" | "settings";

const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: typeof Sparkles }> = [
  { key: "skills", label: "Skills", icon: Sparkles },
  { key: "tools", label: "Tools", icon: Wrench },
  { key: "marketplace", label: "Marketplace", icon: ShoppingBag },
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

  useEffect(() => {
    document.documentElement.classList.add("dark");
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

  const onToggleTool = useCallback(async (tool: ToolInfo, enabled: boolean) => {
    try {
      await setToolEnabled(tool.id, enabled);
      toast.success(`${tool.name} is now ${enabled ? "enabled" : "disabled"}`);
      await refresh();
    } catch (error) {
      toast.error(`Failed to update tool: ${String(error)}`);
    }
  }, [refresh]);

  const searchPlaceholder =
    view === "skills" ? "Search skills" : view === "tools" ? "Search tools" : null;

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
            <div className="rounded-md border border-sidebar-border px-3 py-2 text-xs text-muted-foreground">
              Personal workspace · v{__APP_VERSION__}
            </div>
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

      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
