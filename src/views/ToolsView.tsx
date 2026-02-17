import { useMemo } from "react";
import { GripVertical, Trash2, Wrench } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ToolInfo } from "@/types/models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatDisplayPath } from "@/lib/utils";

function SortableToolCard({
  tool,
  onToggle,
  onDeleteCustom,
}: {
  tool: ToolInfo;
  onToggle: (tool: ToolInfo, enabled: boolean) => void;
  onDeleteCustom: (toolId: string) => Promise<void>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tool.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex h-[110px] min-w-[100px] max-w-[400px] flex-1 basis-[280px] flex-col justify-between border-border/80 bg-card/80 p-3.5 shadow-sm transition-colors hover:border-border hover:bg-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <button
            ref={setActivatorNodeRef}
            {...listeners}
            className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium">{tool.name}</span>
              {tool.detected ? (
                <Badge className="bg-emerald-600/80 text-[10px] leading-none text-emerald-50">Detected</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] leading-none">Not detected</Badge>
              )}
              {tool.cli && <Badge variant="outline" className="text-[10px] leading-none">CLI</Badge>}
            </div>
            <p className="mt-1.5 truncate text-xs text-muted-foreground">{formatDisplayPath(tool.configPath)}</p>
            <p className="truncate text-xs text-muted-foreground">{formatDisplayPath(tool.skillsPath)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Switch
            checked={tool.enabled}
            disabled={!tool.detected && tool.kind === "builtin"}
            onCheckedChange={(checked) => onToggle(tool, checked)}
          />
          {tool.kind === "custom" && (
            <Button variant="ghost" size="icon" className="size-6" onClick={() => void onDeleteCustom(tool.id)}>
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

const FLEX_SPACERS = Array.from({ length: 6 });

export function ToolsView({
  tools,
  query,
  onToggle,
  onDeleteCustom,
  onReorder,
}: {
  tools: ToolInfo[];
  query: string;
  onToggle: (tool: ToolInfo, enabled: boolean) => void;
  onDeleteCustom: (toolId: string) => Promise<void>;
  onReorder: (toolOrder: string[]) => void;
}) {
  const isSearching = query.trim().length > 0;

  const filtered = useMemo(() => {
    if (!isSearching) return tools;
    const q = query.trim().toLowerCase();
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(q) || tool.id.toLowerCase().includes(q),
    );
  }, [tools, query, isSearching]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filtered.findIndex((t) => t.id === active.id);
    const newIndex = filtered.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(filtered, oldIndex, newIndex);

    if (isSearching) {
      const filteredIds = new Set(filtered.map((t) => t.id));
      const full: ToolInfo[] = [];
      let ri = 0;
      for (const t of tools) {
        if (filteredIds.has(t.id)) {
          full.push(reordered[ri++]);
        } else {
          full.push(t);
        }
      }
      onReorder(full.map((t) => t.id));
    } else {
      onReorder(reordered.map((t) => t.id));
    }
  };

  const enabledCount = tools.filter((t) => t.enabled).length;
  const detectedCount = tools.filter((t) => t.detected).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Wrench className="size-4 text-emerald-300" />
        <span>{enabledCount} enabled · {detectedCount} detected · {tools.length} total</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={filtered.map((t) => t.id)} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap gap-3">
            {filtered.map((tool) => (
              <SortableToolCard
                key={tool.id}
                tool={tool}
                onToggle={onToggle}
                onDeleteCustom={onDeleteCustom}
              />
            ))}
            {FLEX_SPACERS.map((_, i) => (
              <div key={`sp-${i}`} className="h-0 min-w-[100px] max-w-[400px] flex-1 basis-[280px]" aria-hidden />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
