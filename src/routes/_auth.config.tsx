import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Save, ShieldAlert } from "lucide-react";
import { store, useStore } from "@/lib/subay/store";
import { useAuth } from "@/context/AuthContext.jsx";
import type { Camera } from "@/lib/subay/types";
import { toast } from "sonner";

const OPENCV_HSV_RANGES = [
  {
    name: "Green",
    ranges: [{ label: "Green range", lower: [35, 70, 70], upper: [85, 255, 255] }],
  },
  {
    name: "Orange",
    ranges: [{ label: "Orange range", lower: [11, 100, 100], upper: [25, 255, 255] }],
  },
  {
    name: "Red",
    ranges: [
      { label: "Red range 1", lower: [0, 100, 100], upper: [10, 255, 255] },
      { label: "Red range 2", lower: [170, 100, 100], upper: [180, 255, 255] },
    ],
  },
];

export const Route = createFileRoute("/_auth/config")({
  head: () => ({
    meta: [
      { title: "Camera Configuration · SUBAY" },
      { name: "description", content: "Configure CCTV ROI and HSV thresholds." },
    ],
  }),
  component: ConfigPage,
});

function ConfigPage() {
  const { isAdmin } = useAuth();
  const cameras = useStore((s) => s.cameras);
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState(cameras[0]?.id ?? "");

  useEffect(() => {
    if (isAdmin === false) navigate({ to: "/" });
  }, [isAdmin, navigate]);

  if (isAdmin === false) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const active = cameras.find((c) => c.id === activeId) ?? cameras[0];
  if (!active) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Camera Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tune Region of Interest and HSV thresholds for water-marker detection.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {cameras.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveId(c.id)}
            className={
              "rounded-full border px-3 py-1.5 text-sm transition-colors " +
              (c.id === activeId
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-accent")
            }
          >
            {c.location}
          </button>
        ))}
      </div>

      <CameraEditor key={active.id} camera={active} />
    </div>
  );
}

function CameraEditor({ camera }: { camera: Camera }) {
  const [draft, setDraft] = useState<Camera>(camera);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isFetchingSnapshot, setIsFetchingSnapshot] = useState(false);
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

  async function save() {
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

      <div className="lg:col-span-2 space-y-5 rounded-2xl border border-border bg-card p-5">
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

        <Section title="HSV Thresholds">
          <div className="space-y-4">
            {OPENCV_HSV_RANGES.map((color) => (
              <div key={color.name} className="rounded-2xl border border-border bg-muted p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{color.name}</span>
                  <span className="rounded-full bg-muted px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    OpenCV fixed thresholds
                  </span>
                </div>
                <div className="space-y-3">
                  {color.ranges.map((range) => (
                    <div key={range.label} className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          {range.label}
                        </div>
                        <div className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">
                          Lower: [{range.lower.join(", ")}]
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          &nbsp;
                        </div>
                        <div className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">
                          Upper: [{range.upper.join(", ")}]
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <button
          onClick={save}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Save className="h-4 w-4" />
          Save configuration
        </button>
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
