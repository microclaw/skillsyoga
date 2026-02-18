import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import {
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Edit3,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createSkillDir,
  createGithubGist,
  deleteSkillEmptyDir,
  deleteSkillEntry,
  deleteSkill,
  listSkillFiles,
  renameSkillEntry,
  readSkillEntry,
  revealInFinder,
  saveSkillEntry,
  saveSkillFile,
} from "@/lib/api";
import type { SkillFileEntry, SkillInfo, ToolInfo } from "@/types/models";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
const STANDARD_FOLDERS = ["scripts", "references", "assets", "prompts"];

function sortEntries(entries: SkillFileEntry[]): SkillFileEntry[] {
  const byParent = new Map<string, SkillFileEntry[]>();
  const normalizeParent = (path: string) => {
    const idx = path.lastIndexOf("/");
    return idx === -1 ? "" : path.slice(0, idx);
  };
  const basename = (path: string) => {
    const idx = path.lastIndexOf("/");
    return idx === -1 ? path : path.slice(idx + 1);
  };

  for (const entry of entries) {
    const parent = normalizeParent(entry.relativePath);
    const list = byParent.get(parent) ?? [];
    list.push(entry);
    byParent.set(parent, list);
  }

  const result: SkillFileEntry[] = [];
  const walk = (parent: string) => {
    const children = (byParent.get(parent) ?? []).sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return basename(a.relativePath).localeCompare(basename(b.relativePath));
    });
    for (const child of children) {
      result.push(child);
      if (child.isDir) {
        walk(child.relativePath);
      }
    }
  };

  walk("");
  return result;
}

function normalizeRelativePath(input: string): string | null {
  const trimmed = input.trim().split("\\").join("/").replace(/^\/+/, "");
  if (!trimmed) return null;
  if (trimmed.includes("..")) return null;
  return trimmed.split("/").filter(Boolean).join("/");
}

function ensureMarkdownPath(input: string): string | null {
  const normalized = normalizeRelativePath(input);
  if (!normalized) return null;
  if (normalized.toLowerCase().endsWith(".md")) return normalized;
  return `${normalized}.md`;
}

function createDefaultEntries(): SkillFileEntry[] {
  return [{ relativePath: "SKILL.md", isDir: false }];
}

export function SkillEditorDialog({
  open,
  mode,
  skill,
  tools,
  hasGithubToken,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  skill?: SkillInfo;
  tools: ToolInfo[];
  hasGithubToken: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [targetToolId, setTargetToolId] = useState("");
  const [entries, setEntries] = useState<SkillFileEntry[]>(createDefaultEntries);
  const [selectedFile, setSelectedFile] = useState("SKILL.md");
  const [contentByFile, setContentByFile] = useState<Record<string, string>>({
    "SKILL.md": DEFAULT_CONTENT,
  });
  const [savedByFile, setSavedByFile] = useState<Record<string, string>>({
    "SKILL.md": DEFAULT_CONTENT,
  });
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    entry: SkillFileEntry;
    x: number;
    y: number;
    hasChildren: boolean;
  } | null>(null);
  const [pendingEntry, setPendingEntry] = useState<SkillFileEntry | null>(null);
  const [unsavedSwitchOpen, setUnsavedSwitchOpen] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingGist, setCreatingGist] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editorInstance, setEditorInstance] = useState<MonacoEditor.IStandaloneCodeEditor | null>(null);

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
          const finalEntries = sortEntries(files);
          setEntries(finalEntries);
          setCollapsedDirs(new Set());

          const preferred =
            finalEntries.find((e) => !e.isDir && e.relativePath === "SKILL.md")?.relativePath
            ?? finalEntries.find((e) => !e.isDir)?.relativePath
            ?? "SKILL.md";
          setSelectedFile(preferred);
          const text = await readSkillEntry(skill.path, preferred);
          setContentByFile({ [preferred]: text });
          setSavedByFile({ [preferred]: text });
          setDirtyFiles(new Set());
        } catch (error) {
          toast.error(`Failed loading skill files: ${String(error)}`);
        }
      })();
    } else {
      setTargetToolId(defaultTool);
      setEntries(createDefaultEntries());
      setCollapsedDirs(new Set());
      setSelectedFile("SKILL.md");
      setContentByFile({ "SKILL.md": DEFAULT_CONTENT });
      setSavedByFile({ "SKILL.md": DEFAULT_CONTENT });
      setDirtyFiles(new Set());
    }
  }, [mode, open, skill, tools]);

  useEffect(() => {
    const onWindowClick = () => setContextMenu(null);
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, []);

  const isHiddenByCollapsedParent = (relativePath: string) => {
    const parts = relativePath.split("/");
    if (parts.length <= 1) return false;
    for (let i = 1; i < parts.length; i += 1) {
      const parent = parts.slice(0, i).join("/");
      if (collapsedDirs.has(parent)) {
        return true;
      }
    }
    return false;
  };

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
      setSavedByFile((prev) => ({ ...prev, [relativePath]: text }));
      setDirtyFiles((prev) => {
        const next = new Set(prev);
        next.delete(relativePath);
        return next;
      });
    } catch (error) {
      toast.error(`Failed reading file: ${String(error)}`);
    } finally {
      setLoadingFile(false);
    }
  };

  const saveCurrentFile = async () => {
    if (mode !== "edit" || !skill?.path || !selectedFile) {
      return true;
    }
    if (!dirtyFiles.has(selectedFile)) {
      return true;
    }
    try {
      setSaving(true);
      await saveSkillEntry({
        path: skill.path,
        relativePath: selectedFile,
        content: contentByFile[selectedFile] ?? "",
      });
      setSavedByFile((prev) => ({ ...prev, [selectedFile]: contentByFile[selectedFile] ?? "" }));
      setDirtyFiles((prev) => {
        const next = new Set(prev);
        next.delete(selectedFile);
        return next;
      });
      toast.success(`${selectedFile} saved`);
      return true;
    } catch (error) {
      toast.error(`Failed to save file: ${String(error)}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onSelectEntry = async (entry: SkillFileEntry) => {
    if (entry.isDir) {
      setCollapsedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(entry.relativePath)) {
          next.delete(entry.relativePath);
        } else {
          next.add(entry.relativePath);
        }
        return next;
      });
      return;
    }
    if (mode === "edit" && selectedFile !== entry.relativePath && dirtyFiles.has(selectedFile)) {
      setPendingEntry(entry);
      setUnsavedSwitchOpen(true);
      return;
    }
    setSelectedFile(entry.relativePath);
    await loadFile(entry.relativePath);
  };

  const switchToEntry = async (entry: SkillFileEntry) => {
    setSelectedFile(entry.relativePath);
    await loadFile(entry.relativePath);
  };

  const onUnsavedSaveAndSwitch = async () => {
    if (!pendingEntry) return;
    const target = pendingEntry;
    const ok = await saveCurrentFile();
    if (!ok) return;
    setUnsavedSwitchOpen(false);
    setPendingEntry(null);
    await switchToEntry(target);
  };

  const onUnsavedDiscardAndSwitch = async () => {
    if (!pendingEntry) return;
    const target = pendingEntry;
    const current = selectedFile;
    setContentByFile((prev) => ({
      ...prev,
      [current]: savedByFile[current] ?? "",
    }));
    setDirtyFiles((prev) => {
      const next = new Set(prev);
      next.delete(current);
      return next;
    });
    setUnsavedSwitchOpen(false);
    setPendingEntry(null);
    await switchToEntry(target);
  };

  const createFolder = async (folderPath: string) => {
    const normalized = normalizeRelativePath(folderPath);
    if (!normalized) {
      toast.error("Invalid folder path");
      return;
    }
    if (entries.some((entry) => entry.relativePath === normalized && entry.isDir)) {
      toast.error("Folder already exists");
      return;
    }
    const parts = normalized.split("/");
    const nextEntries = [...entries];
    for (let i = 1; i <= parts.length; i += 1) {
      const dir = parts.slice(0, i).join("/");
      if (!nextEntries.some((entry) => entry.relativePath === dir && entry.isDir)) {
        nextEntries.push({ relativePath: dir, isDir: true });
      }
    }
    setEntries(sortEntries(nextEntries));

    if (mode === "edit" && skill?.path) {
      try {
        await createSkillDir(skill.path, normalized);
      } catch (error) {
        toast.error(`Failed to create folder: ${String(error)}`);
      }
    }
  };

  const onAddFolder = async () => {
    const input = window.prompt("New folder path relative to this skill", "scripts");
    if (!input) return;
    await createFolder(input);
  };

  const onAddMarkdownAt = (baseDir?: string) => {
    const defaultPath = baseDir ? `${baseDir}/new-note.md` : "references/REFERENCE.md";
    const input = window.prompt("New markdown file path relative to this skill", defaultPath);
    if (!input) return;
    const relative = ensureMarkdownPath(input);
    if (!relative) {
      toast.error("Invalid markdown path");
      return;
    }
    const parent = relative.includes("/") ? relative.slice(0, relative.lastIndexOf("/")) : "";
    void (async () => {
      if (parent) {
        await createFolder(parent);
      }
      const parts = relative.split("/");
      const nextEntries = [...entries];
      if (nextEntries.some((entry) => entry.relativePath === relative && !entry.isDir)) {
        toast.error("File already exists");
        return;
      }
      for (let i = 1; i < parts.length; i += 1) {
        const dir = parts.slice(0, i).join("/");
        if (!nextEntries.some((entry) => entry.relativePath === dir && entry.isDir)) {
          nextEntries.push({ relativePath: dir, isDir: true });
        }
      }
      nextEntries.push({ relativePath: relative, isDir: false });
      setEntries(sortEntries(nextEntries));
      setContentByFile((prev) => ({ ...prev, [relative]: prev[relative] ?? "" }));
      setSavedByFile((prev) => ({ ...prev, [relative]: prev[relative] ?? "" }));
      setSelectedFile(relative);
    })();
  };

  const renameEntry = async (entry: SkillFileEntry) => {
    const parts = entry.relativePath.split("/");
    const oldName = parts[parts.length - 1] ?? entry.relativePath;
    const nextName = window.prompt("Rename", oldName)?.trim();
    if (!nextName || nextName === oldName) return;
    const parent = parts.slice(0, -1).join("/");
    const newRelative = parent ? `${parent}/${nextName}` : nextName;
    const normalized = normalizeRelativePath(newRelative);
    if (!normalized) {
      toast.error("Invalid path");
      return;
    }
    if (entries.some((e) => e.relativePath === normalized)) {
      toast.error("Target already exists");
      return;
    }
    if (mode === "edit" && skill?.path) {
      try {
        await renameSkillEntry(skill.path, entry.relativePath, normalized);
      } catch (error) {
        toast.error(`Rename failed: ${String(error)}`);
        return;
      }
    }

    const remap = (path: string) => {
      if (path === entry.relativePath) return normalized;
      if (entry.isDir && path.startsWith(`${entry.relativePath}/`)) {
        return `${normalized}${path.slice(entry.relativePath.length)}`;
      }
      return path;
    };

    setEntries((prev) =>
      sortEntries(prev.map((e) => ({ ...e, relativePath: remap(e.relativePath) }))),
    );
    setContentByFile((prev) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) next[remap(k)] = v;
      return next;
    });
    setSavedByFile((prev) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) next[remap(k)] = v;
      return next;
    });
    setDirtyFiles((prev) => {
      const next = new Set<string>();
      for (const k of prev) next.add(remap(k));
      return next;
    });
    setCollapsedDirs((prev) => {
      const next = new Set<string>();
      for (const k of prev) next.add(remap(k));
      return next;
    });
    setSelectedFile((prev) => remap(prev));
  };

  const deleteFile = async (entry: SkillFileEntry) => {
    if (!window.confirm(`Move ${entry.relativePath} to Trash?`)) return;
    if (mode === "edit" && skill?.path) {
      try {
        await deleteSkillEntry(skill.path, entry.relativePath);
      } catch (error) {
        toast.error(`Delete failed: ${String(error)}`);
        return;
      }
    }
    setEntries((prev) => prev.filter((e) => e.relativePath !== entry.relativePath));
    setContentByFile((prev) => {
      const next = { ...prev };
      delete next[entry.relativePath];
      return next;
    });
    setSavedByFile((prev) => {
      const next = { ...prev };
      delete next[entry.relativePath];
      return next;
    });
    setDirtyFiles((prev) => {
      const next = new Set(prev);
      next.delete(entry.relativePath);
      return next;
    });
    if (selectedFile === entry.relativePath) {
      const firstFile = entries.find((e) => !e.isDir && e.relativePath !== entry.relativePath)?.relativePath ?? "SKILL.md";
      setSelectedFile(firstFile);
      void loadFile(firstFile);
    }
  };

  const deleteEmptyFolder = async (entry: SkillFileEntry) => {
    const hasChildren = entries.some((e) => e.relativePath.startsWith(`${entry.relativePath}/`));
    if (hasChildren) return;
    if (!window.confirm(`Move empty folder ${entry.relativePath} to Trash?`)) return;
    if (mode === "edit" && skill?.path) {
      try {
        await deleteSkillEmptyDir(skill.path, entry.relativePath);
      } catch (error) {
        toast.error(`Delete failed: ${String(error)}`);
        return;
      }
    }
    setEntries((prev) => prev.filter((e) => e.relativePath !== entry.relativePath));
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      next.delete(entry.relativePath);
      return next;
    });
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
        const dirs = entries.filter((entry) => entry.isDir);
        for (const dir of dirs) {
          await createSkillDir(created.path, dir.relativePath);
        }
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
      const ok = await saveCurrentFile();
      if (ok) {
        await onSaved();
      }
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

  const onCreateGist = async () => {
    if (mode !== "edit" || !skill) {
      return;
    }
    if (!hasGithubToken) {
      window.alert("Please set GitHub Token in Settings.");
      return;
    }
    const selection = editorInstance?.getSelection();
    const model = editorInstance?.getModel();
    const selectedText = selection && model ? model.getValueInRange(selection) : "";
    if (!selectedText.trim()) {
      toast.error("Please select text in the editor first");
      return;
    }

    try {
      setCreatingGist(true);
      const gistUrl = await createGithubGist({
        skillName: skill.name,
        skillDescription: skill.description,
        filePath: selectedFile,
        selectedText,
      });
      toast.success("GitHub Gist created");
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(gistUrl);
      } catch {
        window.open(gistUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      const message = String(error);
      if (message.includes("Please set GitHub Token in Settings.")) {
        window.alert("Please set GitHub Token in Settings.");
        return;
      }
      toast.error(`Failed to create gist: ${message}`);
    } finally {
      setCreatingGist(false);
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
                <div className="text-xs text-muted-foreground">
                  Editing {selectedFile}
                  {dirtyFiles.has(selectedFile) ? " • Unsaved" : ""}
                </div>
              )}
            </div>
            <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
              <div className="w-64 shrink-0 overflow-auto rounded-md border border-border p-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Files</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="size-7" title="Create">
                        <Plus className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => onAddMarkdownAt()}>New Markdown</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void onAddFolder()}>New Folder...</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {STANDARD_FOLDERS.map((folder) => (
                        <DropdownMenuItem key={folder} onClick={() => void createFolder(folder)}>
                          Add {folder}/
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-1">
                  {entries.map((entry) => {
                    if (isHiddenByCollapsedParent(entry.relativePath)) {
                      return null;
                    }
                    const depth = entry.relativePath.split("/").length - 1;
                    const parts = entry.relativePath.split("/");
                    const name = parts[parts.length - 1] ?? entry.relativePath;
                    const isSelected = !entry.isDir && entry.relativePath === selectedFile;
                    const isCollapsed = entry.isDir && collapsedDirs.has(entry.relativePath);
                    const hasChildren = entries.some((candidate) =>
                      candidate.relativePath.startsWith(`${entry.relativePath}/`),
                    );
                    return (
                      <button
                        key={`${entry.isDir ? "d" : "f"}:${entry.relativePath}`}
                        type="button"
                        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${
                          entry.isDir
                            ? "text-muted-foreground hover:bg-muted/40"
                            : isSelected
                              ? "bg-primary/15 text-primary"
                              : "text-foreground hover:bg-muted/50"
                        }`}
                        style={{ paddingLeft: `${8 + depth * 12}px` }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setContextMenu({
                            entry,
                            x: event.clientX,
                            y: event.clientY,
                            hasChildren: entries.some((candidate) =>
                              candidate.relativePath.startsWith(`${entry.relativePath}/`),
                            ),
                          });
                        }}
                        onClick={() => void onSelectEntry(entry)}
                      >
                        {entry.isDir ? (
                          <>
                            {hasChildren ? (
                              isCollapsed ? (
                                <ChevronRight className="size-3 shrink-0" />
                              ) : (
                                <ChevronDown className="size-3 shrink-0" />
                              )
                            ) : (
                              <span className="inline-block size-3 shrink-0" />
                            )}
                            <Folder className="size-3.5 shrink-0" />
                          </>
                        ) : (
                          <>
                            <span className="inline-block size-3 shrink-0" />
                            <FileText className="size-3.5 shrink-0" />
                          </>
                        )}
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
                    onMount={(editor) => {
                      setEditorInstance(editor);
                    }}
                    onChange={(value) =>
                      {
                        const nextValue = value ?? "";
                        setContentByFile((prev) => ({
                          ...prev,
                          [selectedFile]: nextValue,
                        }));
                        setDirtyFiles((prev) => {
                          const next = new Set(prev);
                          const baseline = savedByFile[selectedFile] ?? "";
                          if (nextValue !== baseline) next.add(selectedFile);
                          else next.delete(selectedFile);
                          return next;
                        });
                      }
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
            <div className="flex shrink-0 items-center justify-between">
              <div>
                {mode === "edit" && (
                  <Button variant="outline" disabled={creatingGist || !selectedFile} onClick={() => void onCreateGist()}>
                    <ExternalLink className="size-4" />
                    {creatingGist ? "Creating Gist..." : "Create GitHub Gist"}
                  </Button>
                )}
              </div>
              <Button disabled={saving || !selectedFile} onClick={() => void submit()}>
                {mode === "edit" ? <Save className="size-4" /> : <BadgeCheck className="size-4" />}
                {saving ? "Saving..." : mode === "edit" ? "Save File" : "Create Skill"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {contextMenu && (
        <div
          className="fixed z-[200] min-w-44 rounded-md border border-border bg-popover p-1 text-sm shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.entry.isDir ? (
            <>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/50"
                onClick={() => {
                  setContextMenu(null);
                  onAddMarkdownAt(contextMenu.entry.relativePath);
                }}
              >
                <Plus className="size-3.5" />
                New Markdown
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/50"
                onClick={() => {
                  setContextMenu(null);
                  const input = window.prompt("New folder name", "new-folder");
                  if (!input) return;
                  void createFolder(`${contextMenu.entry.relativePath}/${input}`);
                }}
              >
                <Folder className="size-3.5" />
                New Folder
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/50"
                onClick={() => {
                  setContextMenu(null);
                  void renameEntry(contextMenu.entry);
                }}
              >
                <Edit3 className="size-3.5" />
                Rename Folder
              </button>
              <button
                type="button"
                disabled={contextMenu.hasChildren}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  setContextMenu(null);
                  void deleteEmptyFolder(contextMenu.entry);
                }}
              >
                <Trash2 className="size-3.5" />
                Delete Folder
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/50"
                onClick={() => {
                  setContextMenu(null);
                  void renameEntry(contextMenu.entry);
                }}
              >
                <Edit3 className="size-3.5" />
                Rename File
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setContextMenu(null);
                  void deleteFile(contextMenu.entry);
                }}
              >
                <Trash2 className="size-3.5" />
                Delete File
              </button>
            </>
          )}
        </div>
      )}

      <Dialog
        open={unsavedSwitchOpen}
        onOpenChange={(open) => {
          setUnsavedSwitchOpen(open);
          if (!open) setPendingEntry(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              {`"${selectedFile}" has unsaved changes. Save before switching files?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex sm:justify-end">
            <Button variant="outline" onClick={() => {
              setUnsavedSwitchOpen(false);
              setPendingEntry(null);
            }}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => void onUnsavedDiscardAndSwitch()}>
              Discard
            </Button>
            <Button onClick={() => void onUnsavedSaveAndSwitch()}>
              Save
            </Button>
          </DialogFooter>
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
