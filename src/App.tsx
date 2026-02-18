import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  FolderPlus,
  GitMerge,
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
import { copySkillToTool, deleteCustomTool, reorderTools, setToolEnabled, upsertCustomTool } from "@/lib/api";
import type { SkillInfo, ToolInfo } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  const [appVersion, setAppVersion] = useState(__APP_VERSION__);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncSkill, setSyncSkill] = useState<SkillInfo | null>(null);
  const [syncTargetIds, setSyncTargetIds] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; toolName: string }>({
    current: 0,
    total: 0,
    toolName: "",
  });

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

  const searchPlaceholder = view === "skills" ? "Search skills" : view === "tools" ? "Search tools" : null;
  const eligibleSyncTools = useMemo(() => {
    if (!data || !syncSkill) return [];
    const enabledFor = new Set(syncSkill.enabledFor);
    return data.tools.filter((tool) => tool.enabled && !enabledFor.has(tool.id));
  }, [data, syncSkill]);

  const toggleSyncTarget = (toolId: string, checked: boolean) => {
    setSyncTargetIds((prev) => {
      if (checked) return Array.from(new Set([...prev, toolId]));
      return prev.filter((id) => id !== toolId);
    });
  };

  const openSyncDialog = (skill: SkillInfo) => {
    setSyncSkill(skill);
    setSyncTargetIds([]);
    setSyncProgress({ current: 0, total: 0, toolName: "" });
    setSyncDialogOpen(true);
  };

  const runSync = async () => {
    if (!syncSkill || !data) return;
    const targets = data.tools.filter((tool) => syncTargetIds.includes(tool.id));
    if (targets.length === 0) {
      toast.error("Select at least one target tool");
      return;
    }
    let success = 0;
    const failed: string[] = [];
    setSyncing(true);
    setSyncProgress({ current: 0, total: targets.length, toolName: "" });
    try {
      for (let i = 0; i < targets.length; i += 1) {
        const target = targets[i];
        setSyncProgress({ current: i + 1, total: targets.length, toolName: target.name });
        try {
          await copySkillToTool({
            sourcePath: syncSkill.path,
            targetToolId: target.id,
          });
          success += 1;
        } catch {
          failed.push(target.name);
        }
      }
      await refresh();
      if (failed.length === 0) {
        toast.success(`Synced to ${success} tool${success > 1 ? "s" : ""}`);
      } else {
        toast.error(`Synced ${success}, failed ${failed.length}: ${failed.join(", ")}`);
      }
      setSyncDialogOpen(false);
      setSyncSkill(null);
      setSyncTargetIds([]);
    } finally {
      setSyncing(false);
      setSyncProgress({ current: 0, total: 0, toolName: "" });
    }
  };

  return (
    <div className="dark h-screen overflow-hidden bg-background text-foreground">
      <SidebarProvider>
        <Sidebar variant="inset">
          <SidebarHeader>
            <div className="flex items-center gap-3 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 py-2">
              <div className="size-7 shrink-0 overflow-hidden rounded-md">
                <img
                  src="/skillsyoga-icon.png"
                  alt="SkillsYoga"
                  className="size-full object-cover"
                />
              </div>
              <div>
                <p className="text-sm font-semibold">SkillsYoga</p>
                <p className="text-xs text-muted-foreground">Skills Desktop Manager</p>
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
            <div className="h-8 rounded-md border border-sidebar-border px-3 text-xs leading-8 text-muted-foreground">
              v{appVersion}
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
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

          <main className="mx-auto min-h-0 flex-1 w-full min-w-0 max-w-[1680px] overflow-y-auto space-y-5 p-4 md:p-8">
            {view === "skills" && (
              <SkillsView
                installedCount={data?.stats.installedSkills ?? 0}
                loading={loading}
                skills={filteredSkills}
                onEdit={(skill) => setEditor({ open: true, mode: "edit", source: skill })}
                onSync={openSyncDialog}
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
                hasGithubToken={data.hasGithubToken}
                onGithubTokenChanged={refresh}
                skillEditorDefaultMode={data.skillEditorDefaultMode}
                onEditorDefaultModeChanged={refresh}
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
          hasGithubToken={data.hasGithubToken}
          defaultEditorMode={data.skillEditorDefaultMode}
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

      <Dialog
        open={syncDialogOpen}
        onOpenChange={(open) => {
          if (syncing) return;
          setSyncDialogOpen(open);
          if (!open) {
            setSyncSkill(null);
            setSyncTargetIds([]);
            setSyncProgress({ current: 0, total: 0, toolName: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="size-4" />
              Sync Skill to Tools
            </DialogTitle>
            <DialogDescription>
              {syncSkill
                ? `Copy "${syncSkill.name}" to selected enabled tools.`
                : "Select target tools."}
            </DialogDescription>
          </DialogHeader>
          {syncing ? (
            <div className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p className="font-medium">Sync in progress</p>
              <p className="text-muted-foreground">
                {syncProgress.current}/{syncProgress.total}
                {syncProgress.toolName ? ` · ${syncProgress.toolName}` : ""}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {eligibleSyncTools.length === 0 ? (
                <p className="text-sm text-muted-foreground">No additional enabled tools available.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <Label>Target Tools</Label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSyncTargetIds(eligibleSyncTools.map((tool) => tool.id))}
                      >
                        Select all
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSyncTargetIds([])}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                    {eligibleSyncTools.map((tool) => {
                      const checked = syncTargetIds.includes(tool.id);
                      return (
                        <label key={tool.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={checked}
                            onChange={(event) => toggleSyncTarget(tool.id, event.currentTarget.checked)}
                          />
                          <span className="text-sm">{tool.name}</span>
                          {checked && <Check className="ml-auto size-3.5 text-emerald-400" />}
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={syncing}
              onClick={() => {
                setSyncDialogOpen(false);
                setSyncSkill(null);
                setSyncTargetIds([]);
              }}
            >
              Cancel
            </Button>
            <Button disabled={syncing || syncTargetIds.length === 0} onClick={() => void runSync()}>
              {syncing ? "Syncing..." : "Start Sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
