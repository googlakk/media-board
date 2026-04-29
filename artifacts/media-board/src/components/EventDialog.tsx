import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useCreateEvent, 
  useUpdateEvent, 
  useDeleteEvent,
  getListEventsQueryKey,
  getGetEventStatsQueryKey,
  getGetUpcomingEventsQueryKey,
  getGetEventQueryKey,
  EventStatus,
  type Event
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "./DatePicker";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

const eventSchema = z.object({
  title: z.string().min(1, "Название обязательно"),
  description: z.string().nullable().optional(),
  eventDate: z.date().nullable().optional(),
  location: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum([EventStatus.new, EventStatus.in_progress, EventStatus.shot, EventStatus.published]),
});

type EventFormValues = z.infer<typeof eventSchema>;

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  event?: Event;
}

export function EventDialog({ open, onOpenChange, mode, event }: EventDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      description: "",
      eventDate: null,
      location: "",
      assignee: "",
      notes: "",
      status: EventStatus.new,
    },
  });

  useEffect(() => {
    if (open && mode === "edit" && event) {
      form.reset({
        title: event.title,
        description: event.description || "",
        eventDate: event.eventDate ? new Date(event.eventDate) : null,
        location: event.location || "",
        assignee: event.assignee || "",
        notes: event.notes || "",
        status: event.status,
      });
    } else if (open && mode === "create") {
      form.reset({
        title: "",
        description: "",
        eventDate: null,
        location: "",
        assignee: "",
        notes: "",
        status: EventStatus.new,
      });
    }
  }, [open, mode, event, form]);

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetEventStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUpcomingEventsQueryKey() });
    if (event) {
      queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(event.id) });
    }
  };

  const onSubmit = (data: EventFormValues) => {
    const formattedData = {
      ...data,
      eventDate: data.eventDate ? data.eventDate.toISOString() : null,
    };

    if (mode === "create") {
      createEvent.mutate(
        { data: formattedData },
        {
          onSuccess: () => {
            toast({ title: "Мероприятие создано" });
            invalidateQueries();
            onOpenChange(false);
          },
          onError: () => {
            toast({ title: "Ошибка при создании", variant: "destructive" });
          },
        }
      );
    } else if (mode === "edit" && event) {
      updateEvent.mutate(
        { id: event.id, data: formattedData },
        {
          onSuccess: () => {
            toast({ title: "Мероприятие обновлено" });
            invalidateQueries();
            onOpenChange(false);
          },
          onError: () => {
            toast({ title: "Ошибка при обновлении", variant: "destructive" });
          },
        }
      );
    }
  };

  const handleDelete = () => {
    if (!event) return;
    deleteEvent.mutate(
      { id: event.id },
      {
        onSuccess: () => {
          toast({ title: "Мероприятие удалено" });
          invalidateQueries();
          setDeleteConfirmOpen(false);
          onOpenChange(false);
        },
        onError: () => {
          toast({ title: "Ошибка при удалении", variant: "destructive" });
        },
      }
    );
  };

  const isPending = createEvent.isPending || updateEvent.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Новое мероприятие" : "Редактирование мероприятия"}</DialogTitle>
            <DialogDescription>
              {mode === "create" ? "Заполните данные для создания новой заявки." : "Внесите изменения в существующую заявку."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название *</FormLabel>
                    <FormControl>
                      <Input placeholder="Например: Линейка 1 сентября" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="eventDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Дата проведения</FormLabel>
                      <FormControl>
                        <DatePicker 
                          value={field.value} 
                          onChange={field.onChange} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Статус</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите статус" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={EventStatus.new}>Новые</SelectItem>
                          <SelectItem value={EventStatus.in_progress}>В работе</SelectItem>
                          <SelectItem value={EventStatus.shot}>Снято</SelectItem>
                          <SelectItem value={EventStatus.published}>Опубликовано</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Локация</FormLabel>
                      <FormControl>
                        <Input placeholder="Например: Актовый зал" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="assignee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ответственный</FormLabel>
                      <FormControl>
                        <Input placeholder="Кто снимает" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Описание</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Детали мероприятия, требования к съемке..." 
                        className="resize-none" 
                        {...field} 
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Заметки медиа-центра</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Внутренние заметки, техника, ссылки на материалы..." 
                        className="resize-none" 
                        {...field} 
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {event?.submittedBy && (
                <div className="text-sm text-muted-foreground pt-2">
                  Добавил(а): <span className="font-medium text-foreground">{event.submittedBy}</span>
                </div>
              )}

              <DialogFooter className="pt-4 flex sm:justify-between items-center">
                {mode === "edit" ? (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    size="icon"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 size={16} />
                  </Button>
                ) : <div />}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Отмена
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Сохранение..." : "Сохранить"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить мероприятие?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Мероприятие будет безвозвратно удалено из базы данных.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}