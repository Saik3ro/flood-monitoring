import { useEffect, useRef, useState } from "react";
import type { Camera } from "@/lib/floodsight/types";
import type * as Leaflet from "leaflet";

const COLORS: Record<Camera["floodStatus"], string> = {
  NORMAL: "#22c55e",
  ALERT: "#f59e0b",
  DANGER: "#ef4444",
};

function pinIcon(L: typeof Leaflet, color: string) {
  const html = `
    <div style="position:relative;width:28px;height:36px;">
      <div style="position:absolute;inset:0;background:${color};-webkit-mask:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><path d=%22M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z%22/></svg>') center/contain no-repeat;mask:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><path d=%22M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z%22/></svg>') center/contain no-repeat;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3));"></div>
      <div style="position:absolute;top:6px;left:9px;width:10px;height:10px;border-radius:50%;background:#fff;"></div>
    </div>`;
  return L.divIcon({ html, className: "floodsight-pin", iconSize: [28, 36], iconAnchor: [14, 34], popupAnchor: [0, -30] });
}

export function CameraMap({
  cameras,
  onSelect,
  height = 380,
  focusId,
}: {
  cameras: Camera[];
  onSelect?: (id: string) => void;
  height?: number;
  focusId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const markersRef = useRef<Map<string, Leaflet.Marker>>(new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !ref.current) return;
      const L = mod.default ?? mod;
      LRef.current = L;
      const map = L.map(ref.current, { zoomControl: true }).setView([8.4822, 124.6413], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L || !ready) return;
    const existing = markersRef.current;
    const nextIds = new Set(cameras.map((c) => c.id));
    for (const [id, m] of existing) {
      if (!nextIds.has(id)) {
        m.remove();
        existing.delete(id);
      }
    }
    cameras.forEach((c) => {
      const snapshotImage = c.streamConfig?.ipAddress
        ? `/api/cameras/${encodeURIComponent(c.id)}/snapshot?ts=${Date.now()}`
        : c.snapshotUrl;

      const popup = `
        <div style="font-family:inherit;min-width:200px">
          <img src="${snapshotImage}" style="width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:8px"/>
          <div style="font-weight:600;font-size:13px">${c.location}</div>
          <div style="font-size:12px;color:#666;margin-top:2px">${c.floodStatus} · ${(c.waterLevel * 100).toFixed(0)} cm</div>
          <div style="font-size:11px;color:#999;margin-top:2px">${new Date(c.timestamp).toLocaleTimeString()}</div>
        </div>`;
      let m = existing.get(c.id);
      if (!m) {
        m = L.marker([c.coordinates.lat, c.coordinates.lng], { icon: pinIcon(L, COLORS[c.floodStatus]) }).addTo(map);
        m.on("click", () => onSelect?.(c.id));
        existing.set(c.id, m);
      } else {
        m.setLatLng([c.coordinates.lat, c.coordinates.lng]);
        m.setIcon(pinIcon(L, COLORS[c.floodStatus]));
      }
      m.bindPopup(popup);
    });
  }, [cameras, onSelect, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focusId) return;
    const marker = markersRef.current.get(focusId);
    if (!marker) return;
    map.flyTo(marker.getLatLng(), 16);
    marker.openPopup();
  }, [focusId, ready, cameras]);

  return (
    <div
      ref={ref}
      style={{ height, width: "100%" }}
      className="overflow-hidden rounded-xl border border-border"
    />
  );
}