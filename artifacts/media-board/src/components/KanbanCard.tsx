import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatEventDate } from "@/lib/date-utils";
import type { Event } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, User, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface KanbanCardProps {
  event: Event;
  onClick: () => void;
  isOverlay?: boolean;
}

export function KanbanCard({ event, onClick, isOverlay }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: event.id,
    data: {
      type: "Event",
      event,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isUpcoming = event.eventDate && new Date(event.eventDate).getTime() > Date.now();
  const isOverdue = event.eventDate && new Date(event.eventDate).getTime() < Date.now() && event.status !== 'shot' && event.status !== 'published';

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "cursor-grab active:cursor-grabbing hover-elevate transition-all border-l-4",
        isOverlay && "shadow-xl rotate-2 scale-105 cursor-grabbing",
        event.status === 'new' && "border-l-blue-400",
        event.status === 'in_progress' && "border-l-accent",
        event.status === 'shot' && "border-l-purple-400",
        event.status === 'published' && "border-l-green-500"
      )}
    >
      <CardContent className="p-3.5 flex flex-col gap-2.5">
        <div className="font-medium text-sm leading-tight text-foreground line-clamp-2">
          {event.title}
        </div>

        <div className="flex flex-col gap-1.5 mt-1">
          {event.eventDate && (
            <div className={cn(
              "flex items-center text-xs gap-1.5",
              isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
            )}>
              <Calendar size={13} className="shrink-0" />
              <span className="truncate">{formatEventDate(event.eventDate)}</span>
            </div>
          )}
          
          {event.location && (
            <div className="flex items-center text-xs text-muted-foreground gap-1.5">
              <MapPin size={13} className="shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
        </div>

        {(event.assignee || event.submittedBy) && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
            <div className="flex flex-col gap-1">
              {event.assignee && (
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
                  <User size={12} className="shrink-0" />
                  <span className="truncate max-w-[120px]">{event.assignee}</span>
                </div>
              )}
              {!event.assignee && event.submittedBy && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <MessageSquare size={12} className="shrink-0" />
                  <span className="truncate max-w-[120px]">от {event.submittedBy}</span>
                </div>
              )}
            </div>
            
            {event.notes && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-5">
                Заметки
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}