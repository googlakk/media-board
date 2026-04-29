import { useState, useMemo, useCallback } from "react";
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects
} from "@dnd-kit/core";
import { 
  SortableContext, 
  arrayMove, 
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { useListEvents, useMoveEvent, EventStatus, type Event, getListEventsQueryKey, getGetEventStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCard } from "@/components/KanbanCard";
import { Skeleton } from "@/components/ui/skeleton";
import { EventDialog } from "@/components/EventDialog";
import { useToast } from "@/hooks/use-toast";

const COLUMNS = [
  { id: EventStatus.new, title: "Новые" },
  { id: EventStatus.in_progress, title: "В работе" },
  { id: EventStatus.shot, title: "Снято" },
  { id: EventStatus.published, title: "Опубликовано" },
];

export default function Home() {
  const { data: initialEvents, isLoading } = useListEvents();
  const moveEvent = useMoveEvent();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [events, setEvents] = useState<Event[] | null>(null);
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  // Sync state with server data
  if (initialEvents && !events && !moveEvent.isPending) {
    setEvents(initialEvents);
  } else if (initialEvents && events && initialEvents !== events && !moveEvent.isPending) {
    // Only update if not actively dragging
    setEvents(initialEvents);
  }

  const columnsData = useMemo(() => {
    if (!events) return {};
    const cols: Record<string, Event[]> = {
      [EventStatus.new]: [],
      [EventStatus.in_progress]: [],
      [EventStatus.shot]: [],
      [EventStatus.published]: [],
    };
    events.forEach(e => {
      if (cols[e.status]) {
        cols[e.status].push(e);
      }
    });
    
    // Sort by position within each column
    Object.keys(cols).forEach(k => {
      cols[k].sort((a, b) => a.position - b.position);
    });
    
    return cols;
  }, [events]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeData = active.data.current?.event as Event;
    if (activeData) setActiveEvent(activeData);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const activeContainer = active.data.current?.sortable?.containerId || active.data.current?.event?.status;
    const overContainer = over.data.current?.sortable?.containerId || over.id;

    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }

    setEvents((prev) => {
      if (!prev) return prev;
      
      const activeItems = prev.filter(e => e.status === activeContainer);
      const overItems = prev.filter(e => e.status === overContainer);
      
      const activeIndex = activeItems.findIndex(e => e.id === activeId);
      const overIndex = overItems.findIndex(e => e.id === overId);
      
      let newIndex;
      if (overId in EventStatus) {
        newIndex = overItems.length + 1;
      } else {
        const isBelowOverItem =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;
        const modifier = isBelowOverItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      return prev.map(e => {
        if (e.id === activeId) {
          return { ...e, status: overContainer as EventStatus };
        }
        return e;
      });
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveEvent(null);

    if (!over || !events) return;

    const activeId = active.id as number;
    const overId = over.id;

    const activeData = events.find(e => e.id === activeId);
    if (!activeData) return;

    const activeContainer = activeData.status;
    const overContainer = (over.data.current?.sortable?.containerId || over.id) as EventStatus;

    if (activeContainer !== overContainer) {
      // Handled in drag over, but calculate new position
      const overItems = events.filter(e => e.status === overContainer);
      const overIndex = overItems.findIndex(e => e.id === overId);
      const newPos = overIndex >= 0 ? overIndex : overItems.length;

      // Optimistic
      setEvents(prev => {
        if (!prev) return prev;
        const mapped = prev.map(e => {
          if (e.id === activeId) {
            return { ...e, status: overContainer, position: newPos };
          }
          return e;
        });
        return mapped;
      });

      // API call
      moveEvent.mutate({ id: activeId, data: { status: overContainer, position: newPos } }, {
        onSuccess: (updatedEvents) => {
          setEvents(updatedEvents);
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetEventStatsQueryKey() });
        },
        onError: () => {
          toast({ title: "Ошибка при перемещении", variant: "destructive" });
          if (initialEvents) setEvents(initialEvents); // Revert
        }
      });
    } else {
      // Reordering in same column
      const items = events.filter(e => e.status === activeContainer).sort((a,b) => a.position - b.position);
      const oldIndex = items.findIndex(e => e.id === activeId);
      const newIndex = items.findIndex(e => e.id === overId);

      if (oldIndex !== newIndex && newIndex !== -1) {
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        setEvents(prev => {
          if (!prev) return prev;
          const otherItems = prev.filter(e => e.status !== activeContainer);
          const mappedNewItems = newItems.map((item, idx) => ({ ...item, position: idx }));
          return [...otherItems, ...mappedNewItems];
        });

        moveEvent.mutate({ id: activeId, data: { status: activeContainer, position: newIndex } }, {
          onSuccess: (updatedEvents) => {
            setEvents(updatedEvents);
            queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
          },
          onError: () => {
            toast({ title: "Ошибка при изменении порядка", variant: "destructive" });
            if (initialEvents) setEvents(initialEvents);
          }
        });
      }
    }
  };

  const handleCardClick = useCallback((event: Event) => {
    setEditingEvent(event);
  }, []);

  if (isLoading && !events) {
    return (
      <div className="p-6 h-full w-full flex gap-6 overflow-hidden">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-shrink-0 w-80 flex flex-col gap-4">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="h-full p-4 md:p-6 overflow-x-auto bg-background/50">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex items-start gap-6 h-full pb-4 w-max min-w-full">
            {COLUMNS.map(col => (
              <KanbanColumn
                key={col.id}
                id={col.id}
                title={col.title}
                items={columnsData[col.id] || []}
                onCardClick={handleCardClick}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }) }}>
            {activeEvent ? <KanbanCard event={activeEvent} onClick={() => {}} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <EventDialog 
        open={!!editingEvent} 
        onOpenChange={(open) => !open && setEditingEvent(null)}
        mode="edit"
        event={editingEvent || undefined}
      />
    </>
  );
}