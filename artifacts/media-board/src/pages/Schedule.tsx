import { useGetUpcomingEvents } from "@workspace/api-client-react";
import { formatEventDate, formatRelative, hasNonMidnightTime } from "@/lib/date-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, MapPin, User, Clock, ArrowRight } from "lucide-react";
import { EventDialog } from "@/components/EventDialog";
import { useState } from "react";
import type { Event } from "@workspace/api-client-react";

export default function Schedule() {
  const { data: events, isLoading } = useGetUpcomingEvents();
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48 mb-6" />
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-muted-foreground mb-4">
          <Calendar size={32} />
        </div>
        <h2 className="text-xl font-semibold mb-2">Нет предстоящих съемок</h2>
        <p className="text-muted-foreground">
          На ближайшие 14 дней мероприятий не запланировано. Отдохните или добавьте новую заявку.
        </p>
      </div>
    );
  }

  // Group events by date
  const groupedEvents = events.reduce((acc, event) => {
    const dateStr = event.eventDate ? new Date(event.eventDate).toISOString().split('T')[0] : 'Без даты';
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Новое</Badge>;
      case 'in_progress': return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">В работе</Badge>;
      case 'shot': return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Снято</Badge>;
      case 'published': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Опубликовано</Badge>;
      default: return null;
    }
  };

  return (
    <>
      <div className="p-4 md:p-8 max-w-5xl mx-auto overflow-y-auto h-full pb-24">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Предстоящие мероприятия</h1>
            <p className="text-muted-foreground mt-1">График съемок на ближайшие 14 дней</p>
          </div>
        </div>

        <div className="space-y-10 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
          {Object.entries(groupedEvents).map(([dateStr, dayEvents], index) => (
            <div key={dateStr} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-primary text-primary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                <Clock size={16} />
              </div>
              
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border bg-card shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-primary">
                    {dateStr === 'Без даты' ? dateStr : formatEventDate(dateStr)}
                  </h3>
                  {dateStr !== 'Без даты' && (
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-md">
                      {formatRelative(dateStr)}
                    </span>
                  )}
                </div>
                
                <div className="space-y-3">
                  {dayEvents.map(event => (
                    <div 
                      key={event.id} 
                      className="group/item flex flex-col gap-2 p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer border border-transparent hover:border-border"
                      onClick={() => setEditingEvent(event)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm">{event.title}</div>
                        {getStatusBadge(event.status)}
                      </div>
                      
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground mt-1">
                        {event.eventDate && hasNonMidnightTime(event.eventDate) && (
                          <div className="flex items-center gap-1 font-medium text-foreground">
                            <Clock size={12} />
                            <span>
                              {new Date(event.eventDate).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        )}
                        {event.location && (
                          <div className="flex items-center gap-1">
                            <MapPin size={12} />
                            <span>{event.location}</span>
                          </div>
                        )}
                        {event.assignee && (
                          <div className="flex items-center gap-1 text-primary font-medium">
                            <User size={12} />
                            <span>{event.assignee}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
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