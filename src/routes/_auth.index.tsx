import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera as CameraIcon, MapPin, Clock, Droplets, ChevronLeft, ChevronRight, RefreshCw, Bell } from "lucide-react";
import { StatusBadge } from "@/components/floodsight/StatusBadge";
import { NotificationSidebar, NotificationSheet } from "@/components/floodsight/NotificationSidebar";
import { useLiveCameras } from "@/lib/floodsight/useLiveCameras";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_auth/")({
  head: () => ({
    meta: [
      { title: "Dashboard · FloodSight" },
      { name: "description", content: "Live CCTV flood status and route guidance across Cagayan de Oro City." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const { cameras, dbStatus, dbError, lastUpdate } = useLiveCameras();
  const [activeId, setActiveId] = useState<string>("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (cameras.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="w-full max-w-xl rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <CameraIcon className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">No cameras configured yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a CCTV source from the configuration page to begin live flood monitoring.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/_auth/config" })}
            className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Go to camera config
          </button>
        </div>
      </div>
    );
  }

  const active = cameras.find((c) => c.id === activeId) ?? cameras[0];
  const counts = {
    NORMAL: cameras.filter((c) => c.floodStatus === "NORMAL").length,
    ALERT: cameras.filter((c) => c.floodStatus === "ALERT").length,
    DANGER: cameras.filter((c) => c.floodStatus === "DANGER").length,
  };
  const snapshotReloadToken = lastUpdate.getTime();

  function scroll(dir: -1 | 1) {
    scrollRef.current?.scrollBy({ left: dir * 360, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Flood Watch</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dbStatus === "connected"
              ? `Connected to MongoDB · ${cameras.length} cameras online`
              : dbStatus === "connecting"
              ? "Connecting to MongoDB..."
              : "MongoDB connection failed"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin [animation-duration:6s]" />
            Last update {lastUpdate.toLocaleTimeString()}
          </div>
          <button
            onClick={() => setNotificationsOpen(true)}
            className="rounded-md border border-border bg-card p-2 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Open notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </div>
      {dbError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          MongoDB error: {dbError}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Cameras" value={String(cameras.length)} accent="primary" />
        <StatCard label="Normal" value={String(counts.NORMAL)} accent="normal" />
        <StatCard label="Alert" value={String(counts.ALERT)} accent="alert" />
        <StatCard label="Danger" value={String(counts.DANGER)} accent="danger" />
      </div>

      {/* Carousel */}
      <section className="relative">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Camera feeds
          </h2>
          <div className="flex gap-1">
            <button
              onClick={() => scroll(-1)}
              className="rounded-md border border-border bg-card p-1.5 hover:bg-accent"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => scroll(1)}
              className="rounded-md border border-border bg-card p-1.5 hover:bg-accent"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:thin]"
        >
          {cameras.map((c) => {
            const isActive = c.id === active?.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "group relative shrink-0 snap-center overflow-hidden rounded-2xl border bg-card text-left transition-all",
                  isActive
                    ? "w-[340px] border-primary/60 shadow-xl ring-2 ring-primary/30 sm:w-[420px]"
                    : "w-[260px] border-border opacity-80 hover:opacity-100 sm:w-[300px]",
                )}
              >
                <div className="relative aspect-video w-full overflow-hidden bg-muted">
                  <img
                    src={c.streamConfig?.ipAddress ? `/api/cameras/${encodeURIComponent(c.id)}/snapshot?ts=${snapshotReloadToken}` : c.snapshotUrl}
                    alt={c.location}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    onError={(event) => {
                      const img = event.currentTarget;
                      if (img.src.includes(`/api/cameras/${encodeURIComponent(c.id)}/snapshot`)) {
                        img.src = c.snapshotUrl;
                      }
                    }}
                  />
                  <div className="absolute left-3 top-3">
                    <StatusBadge status={c.floodStatus} />
                  </div>
                  <div className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-xs font-mono text-white backdrop-blur">
                    {(c.waterLevel * 100).toFixed(0)} cm
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="text-sm font-semibold leading-snug">{c.location}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(c.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Active detail */}
      <section>
        {active && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="relative aspect-video w-full overflow-hidden bg-muted">
              <img
                src={active.streamConfig?.ipAddress ? `/api/cameras/${encodeURIComponent(active.id)}/snapshot?ts=${snapshotReloadToken}` : active.snapshotUrl}
                alt={active.location}
                className="h-full w-full object-cover"
                onError={(event) => {
                  const img = event.currentTarget;
                  if (img.src.includes(`/api/cameras/${encodeURIComponent(active.id)}/snapshot`)) {
                    img.src = active.snapshotUrl;
                  }
                }}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <div className="flex items-center justify-between gap-3 text-white">
                  <div>
                    <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/80">
                      <CameraIcon className="h-3.5 w-3.5" />
                      {active.id}
                    </div>
                    <div className="mt-1 text-lg font-bold leading-tight">{active.location}</div>
                  </div>
                  <StatusBadge status={active.floodStatus} className="bg-white/95" />
                </div>
              </div>
              {/* ROI overlay (visual) */}
              <div
                className="pointer-events-none absolute border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.05)]"
                style={{
                  left: `${(active.roiConfig.x / 640) * 100}%`,
                  top: `${(active.roiConfig.y / 400) * 100}%`,
                  width: `${(active.roiConfig.width / 640) * 100}%`,
                  height: `${(active.roiConfig.height / 400) * 100}%`,
                }}
              >
                <span className="absolute -top-5 left-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
                  ROI
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border border-t border-border text-center">
              <Metric icon={<Droplets className="h-4 w-4" />} label="Water level" value={`${(active.waterLevel * 100).toFixed(0)} cm`} />
              <Metric icon={<MapPin className="h-4 w-4" />} label="Coordinates" value={`${active.coordinates.lat.toFixed(3)}, ${active.coordinates.lng.toFixed(3)}`} />
              <Metric icon={<Clock className="h-4 w-4" />} label="Updated" value={new Date(active.timestamp).toLocaleTimeString()} />
            </div>
          </div>
        )}
      </section>
      </div>

      <NotificationSidebar cameras={cameras} className="hidden lg:sticky lg:top-20 lg:block" />
      <NotificationSheet cameras={cameras} open={notificationsOpen} onOpenChange={setNotificationsOpen} />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "primary" | "normal" | "alert" | "danger";
}) {
  const color = {
    primary: "var(--color-primary)",
    normal: "var(--color-status-normal)",
    alert: "var(--color-status-alert)",
    danger: "var(--color-status-danger)",
  }[accent];
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
      <div className="absolute left-0 top-0 h-full w-1" style={{ background: color }} />
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
