import { useCallback, useEffect, useRef, useState } from "react";
import { Cable, Check, CircleAlert, Download, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { installFromRegistry, installSkillFromGithub, searchSkills } from "@/lib/api";
import type { SearchSkillResult, SourceInfo, ToolInfo } from "@/types/models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function formatInstalls(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

type InstallPhase = "select" | "installing" | "done" | "error";
type MarketplaceMode = "discover" | "import";
const QUICK_QUERIES = ["react", "testing", "python", "devops", "prompting"];

export function MarketplaceView({
  sources,
  tools,
  onInstalled,
}: {
  sources: SourceInfo[];
  tools: ToolInfo[];
  onInstalled: () => Promise<void>;
}) {
  const [repoUrl, setRepoUrl] = useState("");
  const [skillPath, setSkillPath] = useState("");
  const [targetToolId, setTargetToolId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<MarketplaceMode>("discover");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchSkillResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Install dialog state
  const [dialogSkill, setDialogSkill] = useState<SearchSkillResult | null>(null);
  const [dialogToolId, setDialogToolId] = useState("");
  const [installPhase, setInstallPhase] = useState<InstallPhase>("select");
  const [installError, setInstallError] = useState("");

  const toolOptions = tools.filter((tool) => tool.enabled && tool.detected);
  const detectedCount = tools.filter((tool) => tool.detected).length;
  const enabledCount = tools.filter((tool) => tool.enabled).length;
  const installReady = toolOptions.length > 0;

  useEffect(() => {
    if (!targetToolId && toolOptions.length > 0) {
      setTargetToolId(toolOptions[0].id);
    }
  }, [targetToolId, toolOptions]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    try {
      setSearching(true);
      const results = await searchSkills(query.trim());
      setSearchResults(results);
      setHasSearched(true);
    } catch (error) {
      toast.error(`Search failed: ${String(error)}`);
    } finally {
      setSearching(false);
    }
  }, []);

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doSearch(value);
    }, 400);
  };

  const openInstallDialog = (result: SearchSkillResult) => {
    setDialogSkill(result);
    setDialogToolId(toolOptions.length > 0 ? toolOptions[0].id : "");
    setInstallPhase("select");
    setInstallError("");
  };

  const closeInstallDialog = () => {
    if (installPhase === "installing") return;
    setDialogSkill(null);
  };

  const doInstallFromRegistry = async () => {
    if (!dialogSkill || !dialogToolId) return;
    try {
      setInstallPhase("installing");
      await installFromRegistry({
        source: dialogSkill.source,
        skillId: dialogSkill.skillId,
        targetToolId: dialogToolId,
      });
      setInstallPhase("done");
      await onInstalled();
    } catch (error) {
      setInstallError(String(error));
      setInstallPhase("error");
    }
  };

  const onSubmit = async () => {
    if (!repoUrl || !targetToolId) {
      toast.error("Repo URL and target tool are required");
      return;
    }
    if (!repoUrl.startsWith("https://github.com/")) {
      toast.error("Only GitHub repository URLs are supported");
      return;
    }

    try {
      setSubmitting(true);
      await installSkillFromGithub({
        repoUrl,
        skillPath: skillPath || undefined,
        targetToolId,
      });
      toast.success("Skill imported from GitHub");
      await onInstalled();
    } catch (error) {
      toast.error(`Install failed: ${String(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-card/60 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Skill Discovery</p>
            {!installReady && <CircleAlert className="size-3.5 text-amber-300" />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={installReady ? "secondary" : "outline"} className="text-[10px]">
              {installReady ? `${toolOptions.length} install-ready` : "No install-ready tools"}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">{detectedCount} detected</Badge>
            <Badge variant="secondary" className="text-[10px]">{enabledCount} enabled</Badge>
          </div>
        </div>
        <div className="inline-flex items-center rounded-lg border border-border/80 bg-muted/30 p-1">
          <Button
            variant={mode === "discover" ? "secondary" : "ghost"}
            size="sm"
            className="min-w-24"
            onClick={() => setMode("discover")}
          >
            Discover
          </Button>
          <Button
            variant={mode === "import" ? "secondary" : "ghost"}
            size="sm"
            className="min-w-24"
            onClick={() => setMode("import")}
          >
            Import
          </Button>
        </div>
      </div>

      {mode === "discover" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="size-4" />
                Discover Skills
              </CardTitle>
              <CardDescription>
                Search the skills.sh registry and install directly to your selected tool.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={searchQuery}
                onChange={(e) => onSearchChange(e.currentTarget.value)}
                placeholder="Search skills... (e.g. react, python, testing)"
              />
              <div className="flex flex-wrap gap-1.5">
                {QUICK_QUERIES.map((query) => (
                  <button
                    key={query}
                    type="button"
                    className="rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    onClick={() => {
                      setSearchQuery(query);
                      void doSearch(query);
                    }}
                  >
                    {query}
                  </button>
                ))}
              </div>

              {searching && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Searching...
                </div>
              )}

              {!searching && hasSearched && searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground">No skills found for "{searchQuery}".</p>
              )}

              {!searching && !hasSearched && (
                <div className="rounded-md border border-dashed border-border/80 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                  Start with a query or pick a quick keyword above.
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="grid grid-cols-1 gap-2">
                  {searchResults.map((result) => (
                    <div
                      key={result.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-medium text-sm">{result.name}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {formatInstalls(result.installs)} installs
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {result.skillId} · {result.source}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={!installReady}
                        onClick={() => openInstallDialog(result)}
                      >
                        <Download className="size-3.5" />
                        Install
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Install dialog */}
      <Dialog open={dialogSkill !== null} onOpenChange={(open) => { if (!open) closeInstallDialog(); }}>
        <DialogContent showCloseButton={installPhase !== "installing"}>
          <DialogHeader>
            <DialogTitle>
              Install "{dialogSkill?.name}"
            </DialogTitle>
            <DialogDescription>
              from {dialogSkill?.source}
            </DialogDescription>
          </DialogHeader>

          {installPhase === "select" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Install to</Label>
                {toolOptions.length > 0 ? (
                  <div className="grid grid-cols-1 gap-1.5">
                    {toolOptions.map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => setDialogToolId(tool.id)}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                          dialogToolId === tool.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/70 bg-muted/30 hover:bg-muted/60"
                        }`}
                      >
                        {dialogToolId === tool.id && <Check className="size-3.5" />}
                        {tool.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-300">Enable and detect at least one tool before installing.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeInstallDialog}>Cancel</Button>
                <Button disabled={!dialogToolId} onClick={() => void doInstallFromRegistry()}>
                  <Download className="size-4" />
                  Install
                </Button>
              </DialogFooter>
            </div>
          )}

          {installPhase === "installing" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Cloning repository and installing skill...</p>
            </div>
          )}

          {installPhase === "done" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="flex size-10 items-center justify-center rounded-full bg-green-500/20">
                <Check className="size-5 text-green-400" />
              </div>
              <p className="text-sm">Skill installed successfully!</p>
              <DialogFooter>
                <Button onClick={closeInstallDialog}>Done</Button>
              </DialogFooter>
            </div>
          )}

          {installPhase === "error" && (
            <div className="space-y-3">
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{installError}</p>
              <DialogFooter>
                <Button variant="outline" onClick={closeInstallDialog}>Close</Button>
                <Button onClick={() => void doInstallFromRegistry()}>Retry</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {mode === "import" && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <Card>
            <CardHeader>
              <CardTitle>Curated Sources</CardTitle>
              <CardDescription>
                Pick a trusted source to prefill the GitHub URL, then install.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2">
              {sources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => setRepoUrl(source.repoUrl)}
                  className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-left text-sm hover:bg-muted/60"
                >
                  <div className="mb-1 flex items-center gap-2 font-medium text-sm">
                    <Sparkles className="size-3.5 text-amber-300" />
                    {source.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{source.description}</div>
                  {source.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {source.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Import from GitHub URL</CardTitle>
              <CardDescription>
                Import one skill folder from a repository. Use Skill Path when needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Repository URL</Label>
                <Input
                  value={repoUrl}
                  onChange={(event) => setRepoUrl(event.currentTarget.value)}
                  placeholder="https://github.com/org/repo"
                />
              </div>
              <div className="space-y-1">
                <Label>Skill Path (Optional)</Label>
                <Input
                  value={skillPath}
                  onChange={(event) => setSkillPath(event.currentTarget.value)}
                  placeholder="skills/skill-name"
                />
              </div>
              <div className="space-y-1">
                <Label>Target Tool</Label>
                <Select value={targetToolId} onValueChange={setTargetToolId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tool" />
                  </SelectTrigger>
                  <SelectContent>
                    {toolOptions.map((tool) => (
                      <SelectItem key={tool.id} value={tool.id}>
                        {tool.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!installReady && (
                  <p className="text-xs text-amber-300">Enable and detect at least one tool before installing.</p>
                )}
              </div>
              <Button disabled={submitting || !installReady} className="w-full" onClick={() => void onSubmit()}>
                <Cable className="size-4" />
                {submitting ? "Installing..." : "Install from GitHub"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
