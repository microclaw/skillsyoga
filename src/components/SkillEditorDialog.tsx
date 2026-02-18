import { useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { Transaction } from "@codemirror/state";
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
  debugLog,
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
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  defaultEditorMode,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  skill?: SkillInfo;
  tools: ToolInfo[];
  hasGithubToken: boolean;
  defaultEditorMode: "view" | "edit";
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
  const [pendingEntry, setPendingEntry] = useState<SkillFileEntry | null>(null);
  const [unsavedSwitchOpen, setUnsavedSwitchOpen] = useState(false);
  const [unsavedCloseOpen, setUnsavedCloseOpen] = useState(false);
  const [createEntryDialogOpen, setCreateEntryDialogOpen] = useState(false);
  const [createEntryType, setCreateEntryType] = useState<"markdown" | "folder">("markdown");
  const [createEntryBaseDir, setCreateEntryBaseDir] = useState<string>("");
  const [createEntryValue, setCreateEntryValue] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SkillFileEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteEntryDialogOpen, setDeleteEntryDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SkillFileEntry | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingGist, setCreatingGist] = useState(false);
  const [editorUiMode, setEditorUiMode] = useState<"view" | "edit">("view");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const editorViewRef = useRef<EditorView | null>(null);
  const nonUserChangeLogCountRef = useRef(0);
  const userChangeLogCountRef = useRef(0);

  const emitDiag = (event: string, data: Record<string, unknown>) => {
    const payload = JSON.stringify({
      event,
      mode,
      editorUiMode,
      selectedFile,
      ...data,
    });
    void debugLog(`[SkillEditorDialog] ${payload}`).catch(() => {});
  };

  const emitEditorStyleDiag = (phase: string, view: EditorView) => {
    const pick = (el: Element | null) => {
      if (!(el instanceof HTMLElement)) return null;
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        display: cs.display,
        position: cs.position,
        overflow: cs.overflow,
        whiteSpace: cs.whiteSpace,
        backgroundColor: cs.backgroundColor,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    const editor = view.dom.querySelector(".cm-editor");
    const scroller = view.dom.querySelector(".cm-scroller");
    const content = view.dom.querySelector(".cm-content");
    const line = view.dom.querySelector(".cm-line");
    const gutters = view.dom.querySelector(".cm-gutters");
    const selectionLayer = view.dom.querySelector(".cm-selectionLayer");
    const selectionBg = view.dom.querySelector(".cm-selectionBackground");

    emitDiag("editor_style_diag", {
      phase,
      editor: pick(editor),
      scroller: pick(scroller),
      content: pick(content),
      line: pick(line),
      gutters: pick(gutters),
      selectionLayer: pick(selectionLayer),
      selectionBackground: pick(selectionBg),
    });
  };

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
          emitDiag("open_edit_skill_loaded", {
            skillPath: skill.path,
            preferredFile: preferred,
            fileCount: finalEntries.length,
            textLength: text.length,
          });
        } catch (error) {
          emitDiag("open_edit_skill_failed", {
            skillPath: skill.path,
            error: String(error),
          });
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
    if (!open) return;
    if (mode === "edit") {
      setEditorUiMode(defaultEditorMode);
    } else {
      setEditorUiMode("edit");
    }
  }, [defaultEditorMode, mode, open]);

  const isReadOnly = mode === "edit" && editorUiMode === "view";

  useEffect(() => {
    if (!open || mode !== "edit") return;
    nonUserChangeLogCountRef.current = 0;
    userChangeLogCountRef.current = 0;
    emitDiag("selected_file_changed", {
      selectedFile,
      cachedContentLength: (contentByFile[selectedFile] ?? "").length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, selectedFile]);

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
      emitDiag("load_file_success", {
        relativePath,
        textLength: text.length,
      });
    } catch (error) {
      emitDiag("load_file_failed", {
        relativePath,
        error: String(error),
      });
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

  const hasCreateDraftChanges = () => {
    if (dirtyFiles.size > 0) return true;
    if (entries.length !== 1) return true;
    return !(entries[0]?.relativePath === "SKILL.md" && entries[0]?.isDir === false);
  };

  const hasUnsavedForClose = () => {
    if (mode === "edit") {
      return dirtyFiles.size > 0;
    }
    return hasCreateDraftChanges();
  };

  const onRequestClose = () => {
    if (hasUnsavedForClose()) {
      setUnsavedCloseOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const onUnsavedSaveAndClose = async () => {
    if (mode === "edit") {
      const ok = await saveCurrentFile();
      if (!ok) return;
      setUnsavedCloseOpen(false);
      onOpenChange(false);
      return;
    }

    await submit();
    setUnsavedCloseOpen(false);
  };

  const onUnsavedDiscardAndClose = () => {
    setUnsavedCloseOpen(false);
    onOpenChange(false);
  };

  const createFolder = async (folderPath: string, options?: { quietIfExists?: boolean }) => {
    const normalized = normalizeRelativePath(folderPath);
    if (!normalized) {
      toast.error("Invalid folder path");
      return;
    }
    if (entries.some((entry) => entry.relativePath === normalized && entry.isDir)) {
      if (!options?.quietIfExists) {
        toast.error("Folder already exists");
      }
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

  const createMarkdownEntry = async (inputPath: string) => {
    const relative = ensureMarkdownPath(inputPath);
    if (!relative) {
      toast.error("Invalid markdown path");
      return;
    }
    const parent = relative.includes("/") ? relative.slice(0, relative.lastIndexOf("/")) : "";
    if (parent) {
      await createFolder(parent, { quietIfExists: true });
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
  };

  const openCreateEntryDialog = (type: "markdown" | "folder", baseDir?: string) => {
    const safeBaseDir = baseDir ?? "";
    setCreateEntryType(type);
    setCreateEntryBaseDir(safeBaseDir);
    if (type === "markdown") {
      setCreateEntryValue(safeBaseDir ? `${safeBaseDir}/new-note.md` : "references/REFERENCE.md");
    } else {
      setCreateEntryValue(safeBaseDir ? `${safeBaseDir}/new-folder` : "scripts");
    }
    setCreateEntryDialogOpen(true);
  };

  const confirmCreateEntry = async () => {
    const value = createEntryValue.trim();
    if (!value) {
      toast.error("Path is required");
      return;
    }
    if (createEntryType === "folder") {
      await createFolder(value);
    } else {
      await createMarkdownEntry(value);
    }
    setCreateEntryDialogOpen(false);
    setCreateEntryValue("");
    setCreateEntryBaseDir("");
  };

  const renameEntry = async (entry: SkillFileEntry, nextNameRaw: string) => {
    const parts = entry.relativePath.split("/");
    const oldName = parts[parts.length - 1] ?? entry.relativePath;
    const nextName = nextNameRaw.trim();
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

  const requestRenameEntry = (entry: SkillFileEntry) => {
    const parts = entry.relativePath.split("/");
    const oldName = parts[parts.length - 1] ?? entry.relativePath;
    setRenameTarget(entry);
    setRenameValue(oldName);
    setRenameDialogOpen(true);
  };

  const confirmRenameEntry = async () => {
    if (!renameTarget) return;
    await renameEntry(renameTarget, renameValue);
    setRenameDialogOpen(false);
    setRenameTarget(null);
    setRenameValue("");
  };

  const deleteFile = async (entry: SkillFileEntry) => {
    if (mode === "edit" && skill?.path) {
      try {
        await deleteSkillEntry(skill.path, entry.relativePath);
      } catch (error) {
        toast.error(`Delete failed: ${String(error)}`);
        return false;
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
    return true;
  };

  const deleteEmptyFolder = async (entry: SkillFileEntry) => {
    const hasChildren = entries.some((e) => e.relativePath.startsWith(`${entry.relativePath}/`));
    if (hasChildren) return false;
    if (mode === "edit" && skill?.path) {
      try {
        await deleteSkillEmptyDir(skill.path, entry.relativePath);
      } catch (error) {
        toast.error(`Delete failed: ${String(error)}`);
        return false;
      }
    }
    setEntries((prev) => prev.filter((e) => e.relativePath !== entry.relativePath));
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      next.delete(entry.relativePath);
      return next;
    });
    return true;
  };

  const requestDeleteEntry = (entry: SkillFileEntry) => {
    setDeleteTarget(entry);
    setDeleteEntryDialogOpen(true);
  };

  const confirmDeleteEntry = async () => {
    if (!deleteTarget) return;
    let ok = false;
    if (deleteTarget.isDir) {
      ok = await deleteEmptyFolder(deleteTarget);
    } else {
      ok = await deleteFile(deleteTarget);
    }
    if (!ok) return;
    setDeleteEntryDialogOpen(false);
    setDeleteTarget(null);
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

  const toAbsoluteEntryPath = (relativePath: string): string | null => {
    if (!skill?.path || mode !== "edit") return null;
    const sep = skill.path.includes("\\") ? "\\" : "/";
    const root = skill.path.replace(/[\\/]+$/, "");
    return `${root}${sep}${relativePath.split("/").join(sep)}`;
  };

  const onRevealEntry = async (entry: SkillFileEntry) => {
    const absolutePath = toAbsoluteEntryPath(entry.relativePath);
    if (!absolutePath) return;
    try {
      await revealInFinder(absolutePath);
    } catch (error) {
      toast.error(`Failed to reveal: ${String(error)}`);
    }
  };

  const onCreateGist = async () => {
    if (mode !== "edit" || !skill) {
      return;
    }
    const editorState = editorViewRef.current?.state;
    const fullText = isReadOnly
      ? selectedContent
      : (editorState?.doc.toString() ?? selectedContent);
    const selectedText = isReadOnly
      ? (window.getSelection()?.toString() ?? "")
      : (editorState
        ? editorState.selection.ranges
          .filter((range) => !range.empty)
          .map((range) => editorState.doc.sliceString(range.from, range.to))
          .join("\n")
        : "");
    if (!selectedText.trim()) {
      window.alert("Please select text before creating a gist.");
      return;
    }
    if (fullText.trim() && selectedText.trim() === fullText.trim()) {
      window.alert("Please select only part of the text.");
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
  const modeLabel = editorUiMode === "view" ? "View" : "Edit";
  const headerTitle = mode === "edit" ? `${modeLabel} Skill` : "Create Skill";
  const fileStatusLabel = mode === "edit" ? `${editorUiMode === "view" ? "Viewing" : "Editing"} ${selectedFile}` : "";

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            onOpenChange(true);
            return;
          }
          onRequestClose();
        }}
      >
        <DialogContent className="fixed inset-5 flex h-auto w-auto max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="shrink-0 px-6 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle>{headerTitle}</DialogTitle>
                  {mode === "edit" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                          Mode: {editorUiMode === "view" ? "View" : "Edit"}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onSelect={() => setEditorUiMode("view")}>View Mode</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setEditorUiMode("edit")}>Edit Mode</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
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
                  {fileStatusLabel}
                  {dirtyFiles.has(selectedFile) ? " • Unsaved" : ""}
                </div>
              )}
              {mode === "edit" && hasGithubToken && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={creatingGist || !selectedFile}
                  onClick={() => void onCreateGist()}
                >
                  <ExternalLink className="size-4" />
                  {creatingGist ? "Creating Gist..." : "Create GitHub Gist"}
                </Button>
              )}
            </div>
            <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
              <div className="w-64 shrink-0 overflow-auto rounded-md border border-border p-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Files</span>
                  <div className="flex items-center gap-1">
                    {mode === "edit" && skill?.path && (
                      <Button variant="outline" size="icon" className="size-7" title="Reveal in Finder" onClick={() => void onReveal()}>
                        <FolderOpen className="size-4" />
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="size-7" title="Create" disabled={isReadOnly}>
                          <Plus className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem disabled={isReadOnly} onSelect={() => openCreateEntryDialog("markdown")}>New Markdown</DropdownMenuItem>
                        <DropdownMenuItem disabled={isReadOnly} onSelect={() => openCreateEntryDialog("folder")}>New Folder...</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {STANDARD_FOLDERS.map((folder) => (
                          <DropdownMenuItem key={folder} disabled={isReadOnly} onSelect={() => void createFolder(folder)}>
                            Add {folder}/
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
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
                      <ContextMenu key={`${entry.isDir ? "d" : "f"}:${entry.relativePath}`}>
                        <ContextMenuTrigger asChild>
                          <button
                            type="button"
                            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${
                              entry.isDir
                                ? "text-muted-foreground hover:bg-muted/40"
                                : isSelected
                                  ? "bg-primary/15 text-primary"
                                  : "text-foreground hover:bg-muted/50"
                            }`}
                            style={{ paddingLeft: `${8 + depth * 12}px` }}
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
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onSelect={() => void onRevealEntry(entry)}>
                            <FolderOpen className="size-3.5" />
                            Reveal in Finder
                          </ContextMenuItem>
                          {entry.isDir ? (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem disabled={isReadOnly} onSelect={() => openCreateEntryDialog("markdown", entry.relativePath)}>
                                <Plus className="size-3.5" />
                                New Markdown
                              </ContextMenuItem>
                              <ContextMenuItem disabled={isReadOnly} onSelect={() => openCreateEntryDialog("folder", entry.relativePath)}>
                                <Folder className="size-3.5" />
                                New Folder
                              </ContextMenuItem>
                              <ContextMenuItem disabled={isReadOnly} onSelect={() => requestRenameEntry(entry)}>
                                <Edit3 className="size-3.5" />
                                Rename Folder
                              </ContextMenuItem>
                              <ContextMenuItem disabled={isReadOnly || hasChildren} onSelect={() => requestDeleteEntry(entry)}>
                                <Trash2 className="size-3.5" />
                                Delete Folder
                              </ContextMenuItem>
                            </>
                          ) : (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem disabled={isReadOnly} onSelect={() => requestRenameEntry(entry)}>
                                <Edit3 className="size-3.5" />
                                Rename File
                              </ContextMenuItem>
                              <ContextMenuItem disabled={isReadOnly} variant="destructive" onSelect={() => requestDeleteEntry(entry)}>
                                <Trash2 className="size-3.5" />
                                Delete File
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </div>
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border border-border">
                {loadingFile ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading file...</div>
                ) : isReadOnly ? (
                  <pre className="skillsyoga-view h-full overflow-auto p-4 text-sm leading-6 whitespace-pre-wrap">{selectedContent}</pre>
                ) : (
                  <CodeMirror
                    value={selectedContent}
                    height="100%"
                    theme="dark"
                    extensions={[EditorView.lineWrapping]}
                    basicSetup={{
                      foldGutter: false,
                      dropCursor: false,
                    }}
                    className="skillsyoga-cm h-full text-sm"
                    onCreateEditor={(view) => {
                      editorViewRef.current = view;
                      const style = window.getComputedStyle(view.contentDOM);
                      const line = view.contentDOM.querySelector(".cm-line");
                      const lineStyle = line ? window.getComputedStyle(line) : null;
                      emitDiag("editor_created", {
                        docLength: view.state.doc.length,
                        contentTextLength: view.contentDOM.textContent?.length ?? 0,
                        contentColor: style.color,
                        contentTextFillColor: style.getPropertyValue("-webkit-text-fill-color"),
                        contentOpacity: style.opacity,
                        lineColor: lineStyle?.color ?? null,
                        lineTextFillColor: lineStyle?.getPropertyValue("-webkit-text-fill-color") ?? null,
                        lineOpacity: lineStyle?.opacity ?? null,
                      });
                      emitEditorStyleDiag("create_immediate", view);
                      window.requestAnimationFrame(() => {
                        emitEditorStyleDiag("create_raf", view);
                      });
                      window.setTimeout(() => {
                        emitEditorStyleDiag("create_200ms", view);
                      }, 200);
                    }}
                    onChange={(value, viewUpdate) => {
                        const isUserEdit = viewUpdate.transactions.some((transaction) => {
                          const userEvent = transaction.annotation(Transaction.userEvent);
                          return typeof userEvent === "string" && userEvent.length > 0;
                        });
                        if (!isUserEdit) {
                          if (nonUserChangeLogCountRef.current < 5) {
                            nonUserChangeLogCountRef.current += 1;
                            emitDiag("editor_change_ignored_non_user", {
                              nextLength: (value ?? "").length,
                              txCount: viewUpdate.transactions.length,
                            });
                          }
                          return;
                        }
                        if (isReadOnly) return;
                        const nextValue = value ?? "";
                        if (userChangeLogCountRef.current < 5) {
                          userChangeLogCountRef.current += 1;
                          emitDiag("editor_change_user", {
                            nextLength: nextValue.length,
                          });
                        }
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
                      }}
                  />
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end">
              <Button disabled={saving || !selectedFile || isReadOnly} onClick={() => void submit()}>
                {mode === "edit" ? <Save className="size-4" /> : <BadgeCheck className="size-4" />}
                {saving ? "Saving..." : mode === "edit" ? "Save File" : "Create Skill"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      <Dialog open={unsavedCloseOpen} onOpenChange={setUnsavedCloseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Save before closing this editor?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex sm:justify-end">
            <Button variant="outline" onClick={() => setUnsavedCloseOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => onUnsavedDiscardAndClose()}>
              Discard
            </Button>
            <Button onClick={() => void onUnsavedSaveAndClose()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createEntryDialogOpen}
        onOpenChange={(open) => {
          setCreateEntryDialogOpen(open);
          if (!open) {
            setCreateEntryValue("");
            setCreateEntryBaseDir("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{createEntryType === "markdown" ? "New Markdown" : "New Folder"}</DialogTitle>
            <DialogDescription>
              Enter a path relative to this skill.
              {createEntryBaseDir ? ` Base directory: ${createEntryBaseDir}` : ""}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={createEntryValue}
            onChange={(event) => setCreateEntryValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void confirmCreateEntry();
              }
            }}
          />
          <DialogFooter className="flex sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setCreateEntryDialogOpen(false);
                setCreateEntryValue("");
                setCreateEntryBaseDir("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void confirmCreateEntry()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          setRenameDialogOpen(open);
          if (!open) {
            setRenameTarget(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{renameTarget?.isDir ? "Rename Folder" : "Rename File"}</DialogTitle>
            <DialogDescription>
              Enter a new name for <span className="font-mono">{renameTarget?.relativePath}</span>.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void confirmRenameEntry();
              }
            }}
          />
          <DialogFooter className="flex sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setRenameDialogOpen(false);
                setRenameTarget(null);
                setRenameValue("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void confirmRenameEntry()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteEntryDialogOpen}
        onOpenChange={(open) => {
          setDeleteEntryDialogOpen(open);
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.isDir
                ? `The folder "${deleteTarget.relativePath}" will be moved to Trash.`
                : `The file "${deleteTarget?.relativePath}" will be moved to Trash.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDeleteEntry()}
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
