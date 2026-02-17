import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { BadgeCheck, FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSkill, readSkillFile, revealInFinder, saveSkillFile } from "@/lib/api";
import type { SkillInfo, ToolInfo } from "@/types/models";
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
  const [content, setContent] = useState(DEFAULT_CONTENT);
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
          const text = await readSkillFile(skill.path);
          setContent(text);
        } catch (error) {
          toast.error(`Failed reading skill: ${String(error)}`);
        }
      })();
    } else {
      setTargetToolId(defaultTool);
      setContent(DEFAULT_CONTENT);
    }
  }, [mode, open, skill, tools]);

  const submit = async () => {
    if (!targetToolId || !content.trim()) {
      toast.error("Tool and content are required");
      return;
    }

    try {
      setSaving(true);
      await saveSkillFile({
        content,
        targetToolId,
        existingPath: mode === "edit" ? skill?.path : undefined,
      });
      toast.success(mode === "edit" ? "Skill updated" : "Skill created");
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast.error(`Failed to save skill: ${String(error)}`);
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
            {mode === "create" && (
              <div className="shrink-0">
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
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
              <Editor
                height="100%"
                language="markdown"
                value={content}
                onChange={(value) => setContent(value ?? "")}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: "on",
                }}
              />
            </div>
            <Button className="shrink-0 self-end" disabled={saving} onClick={() => void submit()}>
              <BadgeCheck className="size-4" />
              {saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Skill"}
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
