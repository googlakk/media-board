import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard } from "./KanbanCard";
import type { Event, EventStatus } from "@workspace/api-client-react";

interface KanbanColumnProps {
  id: EventStatus;
  title: string;
  items: Event[];
  onCardClick: (event: Event) => void;
}

export function KanbanColumn({ id, title, items, onCardClick }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id: id,
  });

  return (
    <div className="flex flex-col w-80 max-w-xs shrink-0 h-full max-h-full">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="font-semibold text-foreground/80">{title}</h3>
        <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>
      
      <div 
        ref={setNodeRef}
        className="flex-1 bg-secondary/30 rounded-xl p-3 flex flex-col gap-3 min-h-[200px] overflow-y-auto"
      >
        <SortableContext 
          id={id}
          items={items.map(item => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <KanbanCard 
              key={item.id} 
              event={item} 
              onClick={() => onCardClick(item)} 
            />
          ))}
          {items.length === 0 && (
            <div className="h-full flex items-center justify-center p-4 text-center text-sm text-muted-foreground border-2 border-dashed border-muted rounded-lg">
              Нет заявок
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}