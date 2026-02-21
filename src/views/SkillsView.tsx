import { useMemo, useState } from "react";
import { GitMerge, LayoutGrid, List, Pencil, Sparkles } from "lucide-react";
import type { SkillInfo } from "@/types/models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type LayoutMode = "grid" | "list";

const STORAGE_KEY = "skills-layout";
const FLEX_SPACERS = Array.from({ length: 6 });

function getStoredLayout(): LayoutMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "list" || v === "grid") return v;
  } catch { /* ignore */ }
  return "grid";
}

export function SkillsView({
  installedCount,
  loading,
  skills,
  onEdit,
  onSync,
}: {
  installedCount: number;
  loading: boolean;
  skills: SkillInfo[];
  onEdit: (skill: SkillInfo) => void;
  onSync: (skill: SkillInfo) => void;
}) {
  const [layout, setLayout] = useState<LayoutMode>(getStoredLayout);
  const groupedSkills = useMemo(() => {
    const map = new Map<string, SkillInfo[]>();
    for (const skill of skills) {
      const key = skill.name.trim().toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.push(skill);
      } else {
        map.set(key, [skill]);
      }
    }

    return Array.from(map.values()).map((variants) => {
      const sorted = [...variants].sort((a, b) => {
        return a.source.localeCompare(b.source) || a.path.localeCompare(b.path);
      });
      const descriptions = new Set(sorted.map((item) => item.description.trim()));
      const enabledFor = Array.from(new Set(sorted.flatMap((item) => item.enabledFor))).sort((a, b) => a.localeCompare(b));
      return {
        primary: sorted[0],
        enabledFor,
        hasDescriptionDiff: descriptions.size > 1,
        variantCount: sorted.length,
      };
    });
  }, [skills]);

  const toggleLayout = (mode: LayoutMode) => {
    setLayout(mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (skills.length === 0) {
    return <p className="text-sm text-muted-foreground">No skills found. Create one or import from Marketplace.</p>;
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-indigo-300" />
          <span>{installedCount} skills installed</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <Button
            variant={layout === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            onClick={() => toggleLayout("grid")}
            title="Grid view"
          >
            <LayoutGrid className="size-3.5" />
          </Button>
          <Button
            variant={layout === "list" ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            onClick={() => toggleLayout("list")}
            title="List view"
          >
            <List className="size-3.5" />
          </Button>
        </div>
      </div>

      {layout === "grid" ? (
        <div className="flex flex-wrap gap-3">
          {groupedSkills.map((group, index) => (
            <Card key={group.primary.name.toLowerCase()} className="flex h-[150px] min-w-[100px] max-w-[400px] flex-1 basis-[280px] flex-col justify-between border-border/80 bg-card/80 p-3.5 shadow-sm transition hover:border-border hover:bg-card">
              <div>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "shrink-0 rounded-md p-1 text-white",
                      index % 3 === 0 && "bg-linear-to-br from-fuchsia-500 to-pink-500",
                      index % 3 === 1 && "bg-linear-to-br from-emerald-500 to-cyan-500",
                      index % 3 === 2 && "bg-linear-to-br from-sky-500 to-indigo-500",
                    )}
                  >
                    <Sparkles className="size-3" />
                  </div>
                  <span className="truncate text-sm font-medium">{group.primary.name}</span>
                  {group.variantCount > 1 && (
                    <Badge variant="outline" className="text-[10px] leading-none">
                      {group.variantCount} tools
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">{group.primary.description}</p>
                {group.hasDescriptionDiff && (
                  <p className="mt-1 text-[10px] text-amber-300">Description differs across tools.</p>
                )}
              </div>
              <div className="flex items-end justify-between">
                <div className="flex flex-wrap gap-1">
                  {group.enabledFor.map((toolId) => (
                    <Badge key={toolId} variant="secondary" className="text-[10px] leading-none font-medium">
                      {toolId}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="size-6 shrink-0" title="Sync to tools" onClick={() => onSync(group.primary)}>
                    <GitMerge className="size-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-6 shrink-0" title="Edit skill" onClick={() => onEdit(group.primary)}>
                    <Pencil className="size-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {FLEX_SPACERS.map((_, i) => (
            <div key={`sp-${i}`} className="h-0 min-w-[100px] max-w-[400px] flex-1 basis-[280px]" aria-hidden />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5 overflow-hidden">
          {groupedSkills.map((group, index) => (
            <div
              key={group.primary.name.toLowerCase()}
              className="group flex min-w-0 items-center gap-3 overflow-hidden rounded-md border border-border/80 bg-card/80 px-3 py-2 transition hover:border-border hover:bg-card"
            >
              <div
                className={cn(
                  "shrink-0 rounded-md p-1 text-white",
                  index % 3 === 0 && "bg-linear-to-br from-fuchsia-500 to-pink-500",
                  index % 3 === 1 && "bg-linear-to-br from-emerald-500 to-cyan-500",
                  index % 3 === 2 && "bg-linear-to-br from-sky-500 to-indigo-500",
                )}
              >
                <Sparkles className="size-3" />
              </div>
              <span className="w-[160px] shrink-0 truncate text-sm font-medium">{group.primary.name}</span>
              <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{group.primary.description}</p>
              {group.hasDescriptionDiff && (
                <span className="shrink-0 text-[10px] text-amber-300">(description differs)</span>
              )}
              <div className="flex shrink-0 items-center gap-1">
                {group.enabledFor.map((toolId) => (
                  <Badge key={toolId} variant="secondary" className="text-[10px] leading-none font-medium">
                    {toolId}
                  </Badge>
                ))}
                {group.variantCount > 1 && (
                  <Badge variant="outline" className="text-[10px] leading-none">
                    {group.variantCount} tools
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="size-6 shrink-0 opacity-0 group-hover:opacity-100" title="Sync to tools" onClick={() => onSync(group.primary)}>
                  <GitMerge className="size-3" />
                </Button>
                <Button variant="ghost" size="icon" className="size-6 shrink-0 opacity-0 group-hover:opacity-100" title="Edit skill" onClick={() => onEdit(group.primary)}>
                  <Pencil className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
