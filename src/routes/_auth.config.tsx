import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Save, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/subay/store";
import { useAuth } from "@/context/AuthContext.jsx";
import type { Camera } from "@/lib/subay/types";
import { toast } from "sonner";

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
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <img src={draft.snapshotUrl} alt={draft.location} className="h-full w-full object-cover" />
          <div
            className="pointer-events-none absolute border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"
            style={{
              left: `${(draft.roiConfig.x / 640) * 100}%`,
              top: `${(draft.roiConfig.y / 400) * 100}%`,
              width: `${(draft.roiConfig.width / 640) * 100}%`,
              height: `${(draft.roiConfig.height / 400) * 100}%`,
            }}
          >
            <span className="absolute -top-6 left-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
              ROI
            </span>
          </div>
        </div>
        <div className="border-t border-border p-4 text-xs text-muted-foreground">
          Snapshot from {new Date(camera.timestamp).toLocaleString()} — ROI overlay reflects pending changes.
        </div>
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

        <Section title="Region of Interest (px)">
          <div className="grid grid-cols-2 gap-3">
            {(["x", "y", "width", "height"] as const).map((k) => (
              <Field key={k} label={k.toUpperCase()}>
                <input
                  type="number"
                  value={draft.roiConfig[k]}
                  onChange={(e) =>
                    setDraft({ ...draft, roiConfig: { ...draft.roiConfig, [k]: +e.target.value } })
                  }
                  className="input"
                />
              </Field>
            ))}
          </div>
        </Section>

        <Section title="HSV Thresholds">
          <div className="space-y-3">
            {(
              [
                ["h_min", "h_max", "Hue"],
                ["s_min", "s_max", "Saturation"],
                ["v_min", "v_max", "Value"],
              ] as const
            ).map(([minK, maxK, label]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium">{label}</span>
                  <span className="font-mono text-muted-foreground">
                    {draft.hsvThresholds[minK]} – {draft.hsvThresholds[maxK]}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={draft.hsvThresholds[minK]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        hsvThresholds: { ...draft.hsvThresholds, [minK]: +e.target.value },
                      })
                    }
                    className="input"
                  />
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={draft.hsvThresholds[maxK]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        hsvThresholds: { ...draft.hsvThresholds, [maxK]: +e.target.value },
                      })
                    }
                    className="input"
                  />
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
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}