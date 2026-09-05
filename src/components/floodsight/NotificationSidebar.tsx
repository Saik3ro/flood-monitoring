import { useNavigate } from "@tanstack/react-router";
import { Bell, Clock, Droplets, MapPin } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Camera, FloodStatus } from "@/lib/floodsight/types";
import { cn } from "@/lib/utils";

const SEVERITY_ORDER: Record<FloodStatus, number> = { DANGER: 0, ALERT: 1, NORMAL: 2 };

const DOT_COLOR: Record<FloodStatus, string> = {
  NORMAL: "var(--color-status-normal)",
  ALERT: "var(--color-status-alert)",
  DANGER: "var(--color-status-danger)",
};

function sortBySeverity(cameras: Camera[]) {
  return [...cameras].sort((a, b) => SEVERITY_ORDER[a.floodStatus] - SEVERITY_ORDER[b.floodStatus]);
}

function NotificationRow({
  camera,
  index,
  onLocate,
}: {
  camera: Camera;
  index: number;
  onLocate: (id: string) => void;
}) {
  const isActive = camera.floodStatus !== "NORMAL";
  return (
    <button
      onClick={() => onLocate(camera.id)}
      style={{ animationDelay: `${index * 40}ms` }}
      className={cn(
        "animate-in fade-in slide-in-from-right-4 fill-mode-backwards w-full rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-accent hover:shadow-sm",
        !isActive && "opacity-70",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", camera.floodStatus === "DANGER" && "animate-pulse")}
          style={{ backgroundColor: DOT_COLOR[camera.floodStatus] }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-1 text-sm font-semibold leading-snug">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{camera.location}</span>
            </div>
            <span
              className="shrink-0 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: DOT_COLOR[camera.floodStatus] }}
            >
              {camera.floodStatus}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Droplets className="h-3 w-3" />
              {(camera.waterLevel * 100).toFixed(0)} cm
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(camera.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function NotificationList({ cameras, onLocate }: { cameras: Camera[]; onLocate: (id: string) => void }) {
  const sorted = sortBySeverity(cameras);
  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground">No cameras reporting yet.</p>;
  }
  return (
    <div className="space-y-2">
      {sorted.map((camera, index) => (
        <NotificationRow key={camera.id} camera={camera} index={index} onLocate={onLocate} />
      ))}
    </div>
  );
}

function useLocate() {
  const navigate = useNavigate();
  return (id: string) => navigate({ to: "/map-view", search: { camera: id } });
}

export function NotificationSidebar({ cameras, className }: { cameras: Camera[]; className?: string }) {
  const onLocate = useLocate();
  const activeCount = cameras.filter((c) => c.floodStatus !== "NORMAL").length;

  return (
    <aside className={cn("w-80 shrink-0 space-y-3 rounded-2xl border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Bell className="h-4 w-4" />
          Notifications
        </h2>
        {activeCount > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
            {activeCount}
          </span>
        )}
      </div>
      <div className="max-h-[calc(100vh-12rem)] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
        <NotificationList cameras={cameras} onLocate={onLocate} />
      </div>
    </aside>
  );
}

export function NotificationSheet({
  cameras,
  open,
  onOpenChange,
}: {
  cameras: Camera[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const onLocate = useLocate();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <NotificationList cameras={cameras} onLocate={onLocate} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
