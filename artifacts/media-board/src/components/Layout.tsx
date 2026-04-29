import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useGetEventStats } from "@workspace/api-client-react";
import { 
  LayoutDashboard, 
  CalendarDays, 
  PlusCircle, 
  Info,
  Video,
  ListTodo,
  CheckCircle2,
  UploadCloud
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveEvents } from "@/hooks/useLiveEvents";

export function Layout({ children, onAddClick }: { children: ReactNode, onAddClick: () => void }) {
  const [location] = useLocation();
  const { data: stats } = useGetEventStats();
  useLiveEvents();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground">
                <Video size={18} />
              </div>
              <h1 className="font-semibold text-lg tracking-tight">Медиа-доска</h1>
            </div>
            
            <nav className="flex items-center gap-1 hidden md:flex">
              <Link href="/" className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${location === "/" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`}>
                <LayoutDashboard size={16} className="inline-block mr-2" />
                Доска
              </Link>
              <Link href="/schedule" className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${location === "/schedule" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`}>
                <CalendarDays size={16} className="inline-block mr-2" />
                Расписание
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {stats && (
              <div className="hidden lg:flex items-center gap-4 text-sm text-muted-foreground mr-2">
                <div className="flex items-center gap-1.5" title="Всего мероприятий">
                  <ListTodo size={14} />
                  <span>{stats.total}</span>
                </div>
                <div className="flex items-center gap-1.5 text-accent" title="В работе">
                  <Video size={14} />
                  <span>{stats.byStatus.find(s => s.status === 'in_progress')?.count || 0}</span>
                </div>
                <div className="flex items-center gap-1.5 text-primary" title="Предстоящие (до 14 дней)">
                  <CalendarDays size={14} />
                  <span>{stats.upcomingCount}</span>
                </div>
              </div>
            )}
            
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary cursor-help transition-colors">
                  <Info size={16} />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] p-3 text-sm">
                Учителя и организаторы добавляют мероприятия через Telegram-бота. Появившиеся заявки попадают в колонку «Новые».
              </TooltipContent>
            </Tooltip>

            <Button onClick={onAddClick} size="sm" className="gap-2">
              <PlusCircle size={16} />
              <span className="hidden sm:inline">Добавить</span>
            </Button>
          </div>
        </div>
      </header>
      
      <main className="flex-1 overflow-x-auto overflow-y-hidden">
        {children}
      </main>
    </div>
  );
}