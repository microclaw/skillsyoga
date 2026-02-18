import { useState } from "react";
import { toast } from "sonner";
import { discoverSkillsPaths } from "@/lib/api";
import type { CustomToolInput, DiscoveredSkillsRoot } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CustomToolDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (tool: CustomToolInput) => Promise<void>;
}) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [configPath, setConfigPath] = useState("~/.tool");
  const [skillsPath, setSkillsPath] = useState("~/.tool/skills");
  const [scanRoot, setScanRoot] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResults, setScanResults] = useState<DiscoveredSkillsRoot[]>([]);

  const inferConfigPath = (candidate: string) => {
    const normalized = candidate.replace(/[\\/]+$/, "");
    const sep = normalized.includes("\\") ? "\\" : "/";
    const suffix = `${sep}skills`;
    if (!normalized.toLowerCase().endsWith(suffix)) {
      return normalized;
    }
    const parent = normalized.slice(0, -suffix.length);
    return parent.length > 0 ? parent : normalized;
  };

  const runScan = async () => {
    const root = scanRoot.trim() || configPath.trim() || skillsPath.trim();
    if (!root) {
      toast.error("Enter a folder path to scan");
      return;
    }

    setScanLoading(true);
    try {
      const found = await discoverSkillsPaths(root);
      setScanResults(found);
      if (found.length === 0) {
        toast.error("No skill folders found in this location");
      } else {
        toast.success(`Found ${found.length} candidate path${found.length > 1 ? "s" : ""}`);
      }
    } catch (error) {
      toast.error(`Scan failed: ${String(error)}`);
      setScanResults([]);
    } finally {
      setScanLoading(false);
    }
  };

  const submit = async () => {
    if (!id || !name || !skillsPath || !configPath) {
      toast.error("All fields are required");
      return;
    }

    try {
      await onSaved({ id, name, configPath, skillsPath, cli: false });
      onOpenChange(false);
      setId("");
      setName("");
      setScanRoot("");
      setScanResults([]);
    } catch (error) {
      toast.error(`Failed to save custom tool: ${String(error)}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom Tool</DialogTitle>
          <DialogDescription>Register an additional agent tool with any folder path.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>ID</Label>
            <Input value={id} onChange={(event) => setId(event.currentTarget.value)} placeholder="codex" />
          </div>
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="Codex" />
          </div>
          <div className="space-y-1">
            <Label>Config Path</Label>
            <Input value={configPath} onChange={(event) => setConfigPath(event.currentTarget.value)} />
          </div>
          <div className="space-y-1">
            <Label>Skills Path</Label>
            <Input value={skillsPath} onChange={(event) => setSkillsPath(event.currentTarget.value)} />
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="space-y-2">
              <Label>Scan Any Folder for Skills</Label>
              <div className="flex gap-2">
                <Input
                  value={scanRoot}
                  onChange={(event) => setScanRoot(event.currentTarget.value)}
                  placeholder="~/work/my-project"
                />
                <Button variant="outline" onClick={() => void runScan()} disabled={scanLoading}>
                  {scanLoading ? "Scanning..." : "Scan"}
                </Button>
              </div>
              {scanResults.length > 0 && (
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {scanResults.map((result) => (
                    <button
                      key={`${result.path}-${result.skillCount}`}
                      type="button"
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-muted/40"
                      onClick={() => {
                        setSkillsPath(result.path);
                        setConfigPath(inferConfigPath(result.path));
                      }}
                    >
                      <span className="truncate pr-2">{result.path}</span>
                      <span className="shrink-0 text-muted-foreground">{result.skillCount} skill{result.skillCount > 1 ? "s" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Button className="w-full" onClick={() => void submit()}>
            Save Tool
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
