import { useState } from "react";
import { toast } from "sonner";
import type { CustomToolInput } from "@/types/models";
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
          <Button className="w-full" onClick={() => void submit()}>
            Save Tool
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
