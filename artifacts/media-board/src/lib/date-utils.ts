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

export function hasNonMidnightTime(date: string | Date | null | undefined): boolean {
  if (!date) return false;
  const d = new Date(date);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

export function formatEventDateWithTime(date: string | Date | null | undefined): string {
  if (!date) return "Дата не указана";
  const d = new Date(date);

  let dateStr: string;
  if (isToday(d)) dateStr = "Сегодня";
  else if (isTomorrow(d)) dateStr = "Завтра";
  else if (isYesterday(d)) dateStr = "Вчера";
  else dateStr = format(d, "d MMMM yyyy", { locale: ru });

  if (hasNonMidnightTime(d)) {
    return `${dateStr}, ${format(d, "HH:mm")}`;
  }
  return dateStr;
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return "";
  return formatDistanceToNow(new Date(date), { locale: ru, addSuffix: true });
}
