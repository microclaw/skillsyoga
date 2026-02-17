import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDisplayPath } from "@/lib/utils";

export function SettingsView({
  appDataDir,
  installedSkills,
  enabledTools,
}: {
  appDataDir: string;
  installedSkills: number;
  enabledTools: number;
}) {
  const copyPath = async () => {
    await navigator.clipboard.writeText(appDataDir);
    toast.success("App data path copied");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Application Settings</CardTitle>
        <CardDescription>SkillsYoga runs in dark mode and stores local metadata in app data.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>App Data Directory</Label>
          <div className="flex gap-2">
            <Input value={formatDisplayPath(appDataDir)} readOnly />
            <Button variant="outline" size="icon" onClick={() => void copyPath()}>
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
        <div>
          <Label>Theme</Label>
          <Input value="Dark mode only" readOnly />
        </div>
        <div>
          <Label>Shortcuts</Label>
          <Input value="Cmd/Ctrl + Shift + R: Refresh dashboard" readOnly />
        </div>
        <div>
          <Label>Current Snapshot</Label>
          <Input value={`${installedSkills} skills across ${enabledTools} enabled tools`} readOnly />
        </div>
      </CardContent>
    </Card>
  );
}
