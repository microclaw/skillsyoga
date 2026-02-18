import { Copy, ExternalLink, FolderOpen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { revealInFinder, setGithubToken } from "@/lib/api";
import { formatDisplayPath } from "@/lib/utils";

export function SettingsView({
  appDataDir,
  hasGithubToken,
  onGithubTokenChanged,
}: {
  appDataDir: string;
  hasGithubToken: boolean;
  onGithubTokenChanged: () => Promise<void>;
}) {
  const [githubToken, setGithubTokenValue] = useState("");
  const [savingToken, setSavingToken] = useState(false);

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

  const saveToken = async () => {
    const value = githubToken.trim();
    if (!value) {
      toast.error("Enter a GitHub token first");
      return;
    }
    try {
      setSavingToken(true);
      await setGithubToken(value);
      setGithubTokenValue("");
      await onGithubTokenChanged();
      toast.success("GitHub token saved");
    } catch (error) {
      toast.error(`Failed to save token: ${String(error)}`);
    } finally {
      setSavingToken(false);
    }
  };

  const clearToken = async () => {
    try {
      setSavingToken(true);
      await setGithubToken("");
      setGithubTokenValue("");
      await onGithubTokenChanged();
      toast.success("GitHub token cleared");
    } catch (error) {
      toast.error(`Failed to clear token: ${String(error)}`);
    } finally {
      setSavingToken(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Application</CardTitle>
          <CardDescription>SkillsYoga stores local metadata in app data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
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
          <div className="space-y-2">
            <Label>GitHub Token</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                autoComplete="off"
                placeholder={hasGithubToken ? "Configured. Enter a new token to replace." : "Paste your GitHub personal access token"}
                value={githubToken}
                onChange={(event) => setGithubTokenValue(event.currentTarget.value)}
              />
              <Button onClick={() => void saveToken()} disabled={savingToken || !githubToken.trim()}>
                Save
              </Button>
              <Button variant="outline" onClick={() => void clearToken()} disabled={savingToken || (!hasGithubToken && !githubToken.trim())}>
                Clear
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
          <Button variant="outline" className="w-full justify-start gap-3" onClick={() => void openExternal("https://skills.yoga")}>
            <span>Official website</span>
            <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">https://skills.yoga</span>
            <ExternalLink className="size-4 shrink-0" />
          </Button>
          <Button variant="outline" className="w-full justify-start gap-3" onClick={() => void openExternal("https://github.com/microclaw/skillsyoga")}>
            <span>Open Source</span>
            <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">https://github.com/microclaw/skillsyoga</span>
            <ExternalLink className="size-4 shrink-0" />
          </Button>
          <Button variant="outline" className="w-full justify-start gap-3" onClick={() => void openExternal("https://x.com/everettjf")}>
            <span>Author</span>
            <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">https://x.com/everettjf</span>
            <ExternalLink className="size-4 shrink-0" />
          </Button>
          <Button variant="outline" className="w-full justify-start gap-3" onClick={() => void openExternal("https://xnu.app")}>
            <span>More Apps</span>
            <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">https://xnu.app</span>
            <ExternalLink className="size-4 shrink-0" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
