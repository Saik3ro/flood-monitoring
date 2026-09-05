import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { CameraMap } from "@/components/floodsight/CameraMap";
import { DangerLegend } from "@/components/floodsight/DangerLegend";
import { useLiveCameras } from "@/lib/floodsight/useLiveCameras";

export const Route = createFileRoute("/_auth/map-view")({
  validateSearch: (search: Record<string, unknown>): { camera?: string } => ({
    camera: typeof search.camera === "string" ? search.camera : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Map View · FloodSight" },
      { name: "description", content: "Live camera locations and flood status across Cagayan de Oro City." },
    ],
  }),
  component: MapView,
});

function MapView() {
  const { camera: focusId } = Route.useSearch();
  const { cameras, dbStatus, dbError, lastUpdate } = useLiveCameras();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Map View</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dbStatus === "connected"
              ? `Connected to MongoDB · ${cameras.length} cameras online`
              : dbStatus === "connecting"
                ? "Connecting to MongoDB..."
                : "MongoDB connection failed"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin [animation-duration:6s]" />
          Last update {lastUpdate.toLocaleTimeString()}
        </div>
      </div>
      {dbError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          MongoDB error: {dbError}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Camera locations
          </h2>
          <DangerLegend />
        </div>
        <CameraMap cameras={cameras} focusId={focusId} height={640} />
      </div>
    </div>
  );
}
