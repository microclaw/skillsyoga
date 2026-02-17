import { Copy, ExternalLink, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { revealInFinder } from "@/lib/api";
import { formatDisplayPath } from "@/lib/utils";

export function SettingsView({
  appDataDir,
}: {
  appDataDir: string;
}) {
  const copyPath = async () => {
    await navigator.clipboard.writeText(appDataDir);
    toast.success("App data path copied");
  };

  const revealPath = async () => {
    try {
      await revealInFinder(appDataDir);
    } catch (error) {
      toast.error(`Failed to reveal folder: ${String(error)}`);
    }
  };

  const openExternal = async (url: string) => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Application Settings</CardTitle>
          <CardDescription>SkillsYoga stores local metadata in app data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>App Data Directory</Label>
            <div className="flex gap-2">
              <Input value={formatDisplayPath(appDataDir)} readOnly />
              <Button variant="outline" size="icon" title="Reveal in Finder" onClick={() => void revealPath()}>
                <FolderOpen className="size-4" />
              </Button>
              <Button variant="outline" size="icon" title="Copy path" onClick={() => void copyPath()}>
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label>Shortcuts</Label>
            <Input value="Cmd/Ctrl + Shift + R: Refresh dashboard" readOnly />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
          <CardDescription>Project links and author profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" className="w-full justify-between" onClick={() => void openExternal("https://skills.yoga")}>
            Official website
            <ExternalLink className="size-4" />
          </Button>
          <Button variant="outline" className="w-full justify-between" onClick={() => void openExternal("https://github.com/microclaw/skillsyoga")}>
            Open Source
            <ExternalLink className="size-4" />
          </Button>
          <Button variant="outline" className="w-full justify-between" onClick={() => void openExternal("https://x.com/everettjf")}>
            Author
            <ExternalLink className="size-4" />
          </Button>
          <Button variant="outline" className="w-full justify-between" onClick={() => void openExternal("https://xnu.app")}>
            More Apps
            <ExternalLink className="size-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
