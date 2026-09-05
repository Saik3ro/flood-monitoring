import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, Save, Search, ShieldAlert } from "lucide-react";
import { store, useStore } from "@/lib/floodsight/store";
import { useAuth } from "@/context/AuthContext.jsx";
import type { Camera, FloodStatus } from "@/lib/floodsight/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_DOT: Record<FloodStatus, string> = {
  NORMAL: "var(--color-status-normal)",
  ALERT: "var(--color-status-alert)",
  DANGER: "var(--color-status-danger)",
};

export const Route = createFileRoute("/_auth/config")({
  head: () => ({
    meta: [
      { title: "Camera Configuration · FloodSight" },
      { name: "description", content: "Configure CCTV ROI for FloodSight." },
    ],
  }),
  component: ConfigPage,
});

const blankCamera: Camera = {
  id: "draft-camera",
  location: "New Camera",
  coordinates: { lat: 8.4822, lng: 124.6433 },
  waterLevel: 0,
  floodStatus: "NORMAL",
  timestamp: new Date().toISOString(),
  snapshotUrl: "",
  roiConfig: {
    x: 100,
    y: 180,
    width: 320,
    height: 380,
    vertices: [
      { x: 100, y: 180 },
      { x: 420, y: 180 },
      { x: 420, y: 560 },
      { x: 100, y: 560 },
    ],
  },
  hsvThresholds: { h_min: 0, h_max: 30, s_min: 50, s_max: 255, v_min: 40, v_max: 255 },
  streamConfig: {
    ipAddress: "",
    port: 80,
    snapshotPath: "/cgi-bin/snapshot.cgi?channel=1&subtype=0",
  },
};

function ConfigPage() {
  const { isAdmin } = useAuth();
  const cameras = useStore((s) => s.cameras);
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState(cameras[0]?.id ?? "draft-camera");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (isAdmin === false) {
      navigate({ to: "/" });
      return;
    }

    let isMounted = true;

    async function refreshCameras() {
      try {
        const response = await fetch("/api/cameras");
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        if (!isMounted) return;

        store.syncCameras(data);
        if (data.length > 0 && !data.some((camera: Camera) => camera.id === activeId)) {
          setActiveId(data[0].id);
        }
      } catch {
        // Keep the current local state if the backend is temporarily unavailable.
      }
    }

    refreshCameras();
    return () => {
      isMounted = false;
    };
  }, [isAdmin, activeId, navigate]);

  if (isAdmin === false) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const active = cameras.find((c) => c.id === activeId) ?? (cameras.length > 0 ? cameras[0] : blankCamera);
  const hasCameras = cameras.length > 0;

  const numbered = cameras.map((c, i) => ({ ...c, displayNumber: i + 1 }));
  const filtered = filter.trim()
    ? numbered.filter((c) => c.location.toLowerCase().includes(filter.trim().toLowerCase()))
    : numbered;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Camera Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tune the Region of Interest for water-marker detection.
        </p>
      </header>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cameras <span className="text-muted-foreground/70">({cameras.length})</span>
          </h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter cameras…"
              className="input w-48 pl-8 text-xs"
            />
          </div>
        </div>

        {hasCameras ? (
          filtered.length > 0 ? (
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-[repeat(16,minmax(0,1fr))]">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  title={c.location}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-xs font-medium transition-colors",
                    c.id === activeId
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: STATUS_DOT[c.floodStatus] }}
                  />
                  {c.displayNumber}
                </button>
              ))}
            </div>
          ) : (
            <p className="py-3 text-center text-xs text-muted-foreground">
              No cameras match “{filter}”.
            </p>
          )
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-background p-3 text-center text-xs text-muted-foreground">
            No cameras saved yet. Fill in the form below to add your first CCTV.
          </div>
        )}

        {hasCameras ? (
          <p className="truncate text-xs text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{active.location}</span>
          </p>
        ) : null}
      </div>

      <CameraEditor key={active.id} camera={active} onCreated={(created) => setActiveId(created.id)} />
    </div>
  );
}

function CameraEditor({ camera, onCreated }: { camera: Camera; onCreated?: (camera: Camera) => void }) {
  const [draft, setDraft] = useState<Camera>(camera);
  const [previewUrl, setPreviewUrl] = useState<string | null>(camera.snapshotUrl || null);
  const [isFetchingSnapshot, setIsFetchingSnapshot] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [pendingRoi, setPendingRoi] = useState<Camera["roiConfig"] | null>(null);
  const [previewRect, setPreviewRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setDraft(camera);
    setPendingRoi(null);
    setPreviewRect(null);
    setDragStart(null);
    setImageAspectRatio(null);

    setPreviewUrl((current) => {
      if (current && current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return camera.snapshotUrl || null;
    });
  }, [camera]);

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  function getRenderBounds() {
    const image = imageRef.current;
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    if (!image.naturalWidth || !image.naturalHeight) return null;
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    };
  }

  function pointInPercents(clientX: number, clientY: number) {
    const bounds = getRenderBounds();
    if (!bounds) return null;
    return {
      x: clamp((clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((clientY - bounds.top) / bounds.height, 0, 1),
    };
  }

  function renderRectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
      x,
      y,
      width: Math.max(0, Math.max(a.x, b.x) - x),
      height: Math.max(0, Math.max(a.y, b.y) - y),
    };
  }

  function buildStyleFromRoi(roi: Camera["roiConfig"] | null): React.CSSProperties | undefined {
    const image = imageRef.current;
    if (!roi || !image || !image.naturalWidth || !image.naturalHeight) return undefined;
    return {
      left: `${(roi.x / image.naturalWidth) * 100}%`,
      top: `${(roi.y / image.naturalHeight) * 100}%`,
      width: `${(roi.width / image.naturalWidth) * 100}%`,
      height: `${(roi.height / image.naturalHeight) * 100}%`,
    };
  }

  function styleFromPreviewRect(
    rect: { x: number; y: number; width: number; height: number } | null,
  ) {
    if (!rect) return undefined;
    return {
      left: `${rect.x * 100}%`,
      top: `${rect.y * 100}%`,
      width: `${rect.width * 100}%`,
      height: `${rect.height * 100}%`,
    } as React.CSSProperties;
  }

  function naturalizeRect(rect: { x: number; y: number; width: number; height: number }) {
    const bounds = getRenderBounds();
    if (!bounds) return null;
    return {
      x: Math.round(rect.x * bounds.naturalWidth),
      y: Math.round(rect.y * bounds.naturalHeight),
      width: Math.round(rect.width * bounds.naturalWidth),
      height: Math.round(rect.height * bounds.naturalHeight),
    };
  }

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const point = pointInPercents(event.clientX, event.clientY);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(point);
    setPreviewRect({ x: point.x, y: point.y, width: 0, height: 0 });
    setPendingRoi(null);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    const point = pointInPercents(event.clientX, event.clientY);
    if (!point) return;
    setPreviewRect(renderRectFromPoints(dragStart, point));
  }

  function finishDrag() {
    if (!previewRect) {
      setDragStart(null);
      return;
    }

    const candidate = naturalizeRect(previewRect);
    setDragStart(null);
    setPreviewRect(null);

    if (!candidate || candidate.width === 0 || candidate.height === 0) {
      return;
    }

    setPendingRoi(candidate);
  }

  function handlePointerUp() {
    finishDrag();
  }

  function handlePointerCancel() {
    setDragStart(null);
    setPreviewRect(null);
  }

  function confirmPendingRoi() {
    if (!pendingRoi) return;
    setDraft({ ...draft, roiConfig: pendingRoi });
    setPendingRoi(null);
  }

  async function fetchSnapshot() {
    if (!draft.streamConfig?.ipAddress) {
      toast.error("Enter a camera IP address before fetching a snapshot.");
      return;
    }

    setIsFetchingSnapshot(true);
    try {
      const response = await fetch(`/api/cameras/${encodeURIComponent(camera.id)}/snapshot/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.streamConfig),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || `Snapshot test failed (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(url);
      toast.success("Snapshot fetched successfully.");
    } catch (error) {
      toast.error("Snapshot fetch failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsFetchingSnapshot(false);
    }
  }

  async function runEvaluation() {
    if (!camera.id || camera.id === "draft-camera") {
      toast.error("Save the camera first before running evaluation.");
      return;
    }

    setIsEvaluating(true);
    try {
      const response = await fetch(`/api/cameras/${encodeURIComponent(camera.id)}/evaluate`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Evaluation failed (${response.status})`);
      }

      const result = await response.json();
      const latestEvaluation = {
        status: result.status,
        water_level: result.water_level,
        water_ratio: result.water_ratio,
        pixel_detection_accuracy: result.pixel_detection_accuracy,
        classification_accuracy: result.classification_accuracy,
        processed_image_path: result.processed_image_path,
        captured_at: result.timestamp,
        source: "CameraTest_v0.4.py",
      };

      const nextDraft = { ...draft, last_evaluation: latestEvaluation };
      setDraft(nextDraft);
      store.updateCamera(camera.id, nextDraft);
      toast.success("Evaluation completed", {
        description: `${result.status} · water level ${result.water_level}`,
      });
    } catch (error) {
      toast.error("Evaluation failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsEvaluating(false);
    }
  }

  async function save() {
    if (camera.id === "draft-camera") {
      await saveAsNew();
      return;
    }

    store.updateCamera(camera.id, draft);

    try {
      const response = await fetch(`/api/cameras/${encodeURIComponent(camera.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera: draft }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      toast.success("Camera configuration saved", { description: draft.location });
    } catch (error) {
      toast.error("Camera configuration could not be synced to MongoDB", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function saveAsNew() {
    try {
      const response = await fetch(`/api/cameras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera: draft }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const created: Camera = await response.json();
      store.addCamera(created);
      toast.success("New camera added", { description: created.location });
      onCreated?.(created);
    } catch (error) {
      toast.error("Could not add new camera to MongoDB", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3 overflow-hidden rounded-2xl border border-border bg-card">
        <div
          className={
            "relative w-full overflow-hidden bg-muted touch-none " +
            (imageAspectRatio ? `pb-[calc(100%/${imageAspectRatio})]` : "aspect-video")
          }
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {previewUrl || draft.snapshotUrl ? (
            <img
              ref={imageRef}
              src={previewUrl ?? draft.snapshotUrl}
              alt={draft.location}
              className="h-full w-full object-contain"
              draggable={false}
              onLoad={(event) => {
                const img = event.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setImageAspectRatio(img.naturalWidth / img.naturalHeight);
                }
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-center text-sm text-muted-foreground">
              No snapshot yet. Enter the camera details and fetch a preview.
            </div>
          )}

          <div
            className="pointer-events-none absolute border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"
            style={buildStyleFromRoi(draft.roiConfig)}
          >
            <span className="absolute -top-6 left-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
              ROI
            </span>
          </div>

          {previewRect ? (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-yellow-400/90 bg-yellow-400/10"
              style={styleFromPreviewRect(previewRect)}
            />
          ) : null}

          {pendingRoi ? (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-slate-200/90 bg-slate-200/10"
              style={buildStyleFromRoi(pendingRoi)}
            >
              <span className="absolute -top-6 left-0 rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-50">
                Pending ROI
              </span>
            </div>
          ) : null}
        </div>

        <div className="border-t border-border p-4 text-xs text-muted-foreground">
          Snapshot from {new Date(camera.timestamp).toLocaleString()} — drag to choose a new ROI,
          then confirm it.
        </div>

        {pendingRoi ? (
          <div className="border-t border-border bg-muted px-4 py-3 text-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-mono text-sm text-foreground">
                x: {pendingRoi.x} · y: {pendingRoi.y} · width: {pendingRoi.width} · height:{" "}
                {pendingRoi.height}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmPendingRoi}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setPendingRoi(null)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="lg:col-span-2 lg:self-start space-y-5 rounded-2xl border border-border bg-card p-5">
        <Field label="Location name">
          <input
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            className="input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input
              type="number"
              step="0.0001"
              value={draft.coordinates.lat}
              onChange={(e) =>
                setDraft({ ...draft, coordinates: { ...draft.coordinates, lat: +e.target.value } })
              }
              className="input"
            />
          </Field>
          <Field label="Longitude">
            <input
              type="number"
              step="0.0001"
              value={draft.coordinates.lng}
              onChange={(e) =>
                setDraft({ ...draft, coordinates: { ...draft.coordinates, lng: +e.target.value } })
              }
              className="input"
            />
          </Field>
        </div>

        <Section title="Camera Connection">
          <div className="space-y-3">
            <Field label="IP address">
              <input
                value={draft.streamConfig?.ipAddress ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    streamConfig: {
                      ...draft.streamConfig,
                      ipAddress: e.target.value,
                    },
                  })
                }
                className="input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Port">
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.streamConfig?.port ?? 80}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      streamConfig: {
                        ...draft.streamConfig,
                        port: Number(e.target.value) || 80,
                      },
                    })
                  }
                  className="input"
                />
              </Field>
              <Field label="Snapshot path">
                <input
                  value={draft.streamConfig?.snapshotPath ?? "/cgi-bin/snapshot.cgi?channel=1&subtype=0"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      streamConfig: {
                        ...draft.streamConfig,
                        snapshotPath: e.target.value,
                      },
                    })
                  }
                  className="input"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username (optional)">
                <input
                  value={draft.streamConfig?.username ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      streamConfig: {
                        ...draft.streamConfig,
                        username: e.target.value,
                      },
                    })
                  }
                  className="input"
                />
              </Field>
              <Field label="Password (optional)">
                <input
                  type="password"
                  value={draft.streamConfig?.password ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      streamConfig: {
                        ...draft.streamConfig,
                        password: e.target.value,
                      },
                    })
                  }
                  className="input"
                />
              </Field>
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={fetchSnapshot}
                disabled={isFetchingSnapshot}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isFetchingSnapshot ? "Fetching snapshot…" : "Fetch snapshot"}
              </button>
            </div>
          </div>
        </Section>

        <Section title="Region of Interest (px)">
          <p className="text-xs text-muted-foreground">
            Drag a box on the snapshot to define the ROI. Confirm before saving.
          </p>
        </Section>

        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={runEvaluation}
              disabled={isEvaluating || camera.id === "draft-camera"}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isEvaluating ? "Running evaluation…" : "Run evaluation"}
            </button>
            <button
              onClick={save}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Save className="h-4 w-4" />
              Save configuration
            </button>
          </div>

          <button
            onClick={saveAsNew}
            title="Add the current settings as a brand new camera instead of overwriting this one"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-card px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Save as new camera
          </button>
        </div>

        {draft.last_evaluation ? (
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">Latest result</span>
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase text-foreground">
                {draft.last_evaluation.status ?? "UNKNOWN"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div>
                <div className="text-[10px] uppercase">Water level</div>
                <div className="font-medium text-foreground">
                  {draft.last_evaluation.water_level ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase">Water ratio</div>
                <div className="font-medium text-foreground">
                  {draft.last_evaluation.water_ratio ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase">PA</div>
                <div className="font-medium text-foreground">
                  {draft.last_evaluation.pixel_detection_accuracy ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase">CA</div>
                <div className="font-medium text-foreground">
                  {draft.last_evaluation.classification_accuracy ?? "-"}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <style>{`.input{width:100%;border-radius:.5rem;border:1px solid var(--color-border);background:var(--color-background);padding:.5rem .65rem;font-size:.875rem;outline:none}.input:focus{border-color:var(--color-primary);box-shadow:0 0 0 3px color-mix(in oklab,var(--color-primary) 25%,transparent)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}
