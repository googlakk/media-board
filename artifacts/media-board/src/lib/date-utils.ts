import { format, isToday, isTomorrow, isYesterday, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

export function formatEventDate(date: string | Date | null | undefined): string {
  if (!date) return "Дата не указана";
  const d = new Date(date);
  
  if (isToday(d)) return "Сегодня";
  if (isTomorrow(d)) return "Завтра";
  if (isYesterday(d)) return "Вчера";
  
  return format(d, "d MMMM yyyy", { locale: ru });
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return "";
  return formatDistanceToNow(new Date(date), { locale: ru, addSuffix: true });
}
