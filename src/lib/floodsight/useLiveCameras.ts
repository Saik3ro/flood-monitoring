import { useEffect, useState } from "react";
import type { Camera } from "@/lib/floodsight/types";
import { store, useStore } from "@/lib/floodsight/store";

export type DbStatus = "connecting" | "connected" | "error";

export function useLiveCameras() {
  const persistedCameras = useStore((s) => s.cameras);
  const [cameras, setCameras] = useState<Camera[]>(persistedCameras);
  const [dbStatus, setDbStatus] = useState<DbStatus>("connecting");
  const [dbError, setDbError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(() => new Date());

  useEffect(() => {
    let isMounted = true;

    async function refreshCameras() {
      try {
        const resp = await fetch("/api/cameras");
        if (!resp.ok) {
          throw new Error(`API returned ${resp.status}`);
        }
        const data: Camera[] = await resp.json();
        if (!isMounted) return;

        const next = data.length > 0 ? data : store.getState().cameras;
        setCameras(next);
        store.syncCameras(next);
        setDbStatus("connected");
        setDbError(null);
        setLastUpdate(new Date());
      } catch (error) {
        if (!isMounted) return;
        setDbStatus("error");
        setDbError(error instanceof Error ? error.message : String(error));
      }
    }

    refreshCameras();
    const id = setInterval(refreshCameras, 7000);
    return () => {
      isMounted = false;
      clearInterval(id);
    };
  }, []);

  return { cameras, dbStatus, dbError, lastUpdate };
}
