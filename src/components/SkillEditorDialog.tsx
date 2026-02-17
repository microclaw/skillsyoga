import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { BadgeCheck, FileText, Folder, FolderOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteSkill,
  listSkillFiles,
  readSkillEntry,
  revealInFinder,
  saveSkillEntry,
  saveSkillFile,
} from "@/lib/api";
import type { SkillFileEntry, SkillInfo, ToolInfo } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DEFAULT_CONTENT = `---
name: New Skill
description: Describe the skill
---

# New Skill

Describe the skill.
`;

const DEFAULT_DIRS = ["scripts", "references", "assets"];

function sortEntries(entries: SkillFileEntry[]): SkillFileEntry[] {
  return [...entries].sort((a, b) => {
    const depthA = a.relativePath.split("/").length;
    const depthB = b.relativePath.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.relativePath.localeCompare(b.relativePath);
  });
}

function normalizeRelativePath(input: string): string | null {
  const trimmed = input.trim().split("\\").join("/").replace(/^\/+/, "");
  if (!trimmed) return null;
  if (trimmed.includes("..")) return null;
  return trimmed.split("/").filter(Boolean).join("/");
}

function createDefaultEntries(): SkillFileEntry[] {
  return sortEntries([
    { relativePath: "SKILL.md", isDir: false },
    ...DEFAULT_DIRS.map((d) => ({ relativePath: d, isDir: true })),
  ]);
}

export function SkillEditorDialog({
  open,
  mode,
  skill,
  tools,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  skill?: SkillInfo;
  tools: ToolInfo[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [targetToolId, setTargetToolId] = useState("");
  const [entries, setEntries] = useState<SkillFileEntry[]>(createDefaultEntries);
  const [selectedFile, setSelectedFile] = useState("SKILL.md");
  const [contentByFile, setContentByFile] = useState<Record<string, string>>({
    "SKILL.md": DEFAULT_CONTENT,
  });
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const defaultTool = tools.find((tool) => tool.enabled)?.id ?? tools[0]?.id ?? "";

    if (mode === "edit" && skill) {
      setTargetToolId(skill.source || defaultTool);
      void (async () => {
        try {
          const files = await listSkillFiles(skill.path);
          const normalized = sortEntries(files);
          const withDefaults = [...normalized];
          for (const dir of DEFAULT_DIRS) {
            if (!withDefaults.some((e) => e.relativePath === dir && e.isDir)) {
              withDefaults.push({ relativePath: dir, isDir: true });
            }
          }
          const finalEntries = sortEntries(withDefaults);
          setEntries(finalEntries);

          const preferred =
            finalEntries.find((e) => !e.isDir && e.relativePath === "SKILL.md")?.relativePath
            ?? finalEntries.find((e) => !e.isDir)?.relativePath
            ?? "SKILL.md";
          setSelectedFile(preferred);
          const text = await readSkillEntry(skill.path, preferred);
          setContentByFile({ [preferred]: text });
        } catch (error) {
          toast.error(`Failed loading skill files: ${String(error)}`);
        }
      })();
    } else {
      setTargetToolId(defaultTool);
      setEntries(createDefaultEntries());
      setSelectedFile("SKILL.md");
      setContentByFile({ "SKILL.md": DEFAULT_CONTENT });
    }
  }, [mode, open, skill, tools]);

  const loadFile = async (relativePath: string) => {
    if (contentByFile[relativePath] !== undefined) {
      return;
    }
    if (!skill?.path || mode !== "edit") {
      setContentByFile((prev) => ({ ...prev, [relativePath]: "" }));
      return;
    }
    try {
      setLoadingFile(true);
      const text = await readSkillEntry(skill.path, relativePath);
      setContentByFile((prev) => ({ ...prev, [relativePath]: text }));
    } catch (error) {
      toast.error(`Failed reading file: ${String(error)}`);
    } finally {
      setLoadingFile(false);
    }
  };

  const onSelectEntry = async (entry: SkillFileEntry) => {
    if (entry.isDir) return;
    setSelectedFile(entry.relativePath);
    await loadFile(entry.relativePath);
  };

  const onAddFile = () => {
    const input = window.prompt(
      "New file path relative to this skill",
      "references/REFERENCE.md",
    );
    if (!input) return;
    const relative = normalizeRelativePath(input);
    if (!relative) {
      toast.error("Invalid file path");
      return;
    }
    if (entries.some((entry) => entry.relativePath === relative && !entry.isDir)) {
      toast.error("File already exists");
      return;
    }

    const parts = relative.split("/");
    const nextEntries = [...entries];
    for (let i = 1; i < parts.length; i += 1) {
      const dir = parts.slice(0, i).join("/");
      if (!nextEntries.some((entry) => entry.relativePath === dir && entry.isDir)) {
        nextEntries.push({ relativePath: dir, isDir: true });
      }
    }
    nextEntries.push({ relativePath: relative, isDir: false });
    setEntries(sortEntries(nextEntries));
    setContentByFile((prev) => ({ ...prev, [relative]: prev[relative] ?? "" }));
    setSelectedFile(relative);
  };

  const submit = async () => {
    try {
      setSaving(true);
      if (mode === "create") {
        if (!targetToolId) {
          toast.error("Tool is required");
          return;
        }
        const skillContent = contentByFile["SKILL.md"] ?? "";
        if (!skillContent.trim()) {
          toast.error("SKILL.md cannot be empty");
          return;
        }

        const created = await saveSkillFile({
          content: skillContent,
          targetToolId,
        });

        const extraFiles = entries.filter(
          (entry) => !entry.isDir && entry.relativePath !== "SKILL.md",
        );
        for (const file of extraFiles) {
          await saveSkillEntry({
            path: created.path,
            relativePath: file.relativePath,
            content: contentByFile[file.relativePath] ?? "",
          });
        }
        toast.success("Skill created");
        onOpenChange(false);
        await onSaved();
        return;
      }

      if (!skill?.path) {
        toast.error("Missing skill path");
        return;
      }
      if (!selectedFile) {
        toast.error("Select a file to save");
        return;
      }

      await saveSkillEntry({
        path: skill.path,
        relativePath: selectedFile,
        content: contentByFile[selectedFile] ?? "",
      });
      toast.success(`${selectedFile} saved`);
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast.error(`Failed to save file: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const onReveal = async () => {
    if (!skill?.path) return;
    try {
      await revealInFinder(skill.path);
    } catch (error) {
      toast.error(`Failed to reveal: ${String(error)}`);
    }
  };

  const onDelete = async () => {
    if (!skill?.path) return;
    try {
      await deleteSkill(skill.path);
      toast.success(`Moved "${skill.name}" to Trash`);
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast.error(`Delete failed: ${String(error)}`);
    }
  };

  const selectedContent = contentByFile[selectedFile] ?? "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[calc(100vh-40px)] w-4/5 max-w-none sm:max-w-none flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-6 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{mode === "edit" ? "Edit Skill" : "Create Skill"}</DialogTitle>
                <DialogDescription>Edit SKILL.md content directly. Name and description are parsed from YAML frontmatter.</DialogDescription>
              </div>
              {mode === "edit" && skill?.path && (
                <div className="mr-8 flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="size-7" title="Add file" onClick={onAddFile}>
                    <Plus className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" title="Reveal in Finder" onClick={() => void onReveal()}>
                    <FolderOpen className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" title="Move to Trash" onClick={() => setDeleteConfirmOpen(true)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-6">
            <div className="flex shrink-0 items-center justify-between gap-2">
              {mode === "create" ? (
                <Select value={targetToolId} onValueChange={setTargetToolId}>
                  <SelectTrigger className="w-60">
                    <SelectValue placeholder="Choose a target tool" />
                  </SelectTrigger>
                  <SelectContent>
                    {tools.map((tool) => (
                      <SelectItem key={tool.id} value={tool.id}>
                        {tool.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-xs text-muted-foreground">Editing {selectedFile}</div>
              )}
              <Button variant="outline" size="sm" onClick={onAddFile}>
                <Plus className="size-4" />
                New File
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
              <div className="w-64 shrink-0 overflow-auto rounded-md border border-border p-2">
                <div className="space-y-1">
                  {entries.map((entry) => {
                    const depth = entry.relativePath.split("/").length - 1;
                    const parts = entry.relativePath.split("/");
                    const name = parts[parts.length - 1] ?? entry.relativePath;
                    const isSelected = !entry.isDir && entry.relativePath === selectedFile;
                    return (
                      <button
                        key={`${entry.isDir ? "d" : "f"}:${entry.relativePath}`}
                        type="button"
                        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${
                          entry.isDir
                            ? "cursor-default text-muted-foreground"
                            : isSelected
                              ? "bg-primary/15 text-primary"
                              : "text-foreground hover:bg-muted/50"
                        }`}
                        style={{ paddingLeft: `${8 + depth * 12}px` }}
                        onClick={() => void onSelectEntry(entry)}
                      >
                        {entry.isDir ? <Folder className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
                        <span className="truncate">{name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border border-border">
                {loadingFile ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading file...</div>
                ) : (
                  <Editor
                    height="100%"
                    language="markdown"
                    value={selectedContent}
                    onChange={(value) =>
                      setContentByFile((prev) => ({
                        ...prev,
                        [selectedFile]: value ?? "",
                      }))
                    }
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      wordWrap: "on",
                    }}
                  />
                )}
              </div>
            </div>
            <Button className="shrink-0 self-end" disabled={saving || !selectedFile} onClick={() => void submit()}>
              <BadgeCheck className="size-4" />
              {saving ? "Saving..." : mode === "edit" ? "Save File" : "Create Skill"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              The skill &quot;{skill?.name}&quot; will be moved to the Trash. You can restore it from the Trash if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void onDelete()}>
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
