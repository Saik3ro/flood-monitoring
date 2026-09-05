export type Role = "admin" | "authority" | "viewer";
export type FloodStatus = "NORMAL" | "ALERT" | "DANGER";

export interface StreamConfig {
  ipAddress: string;
  port?: number;
  username?: string;
  password?: string;
  snapshotPath?: string;
}

export interface Camera {
  id: string;
  location: string;
  coordinates: { lat: number; lng: number };
  waterLevel: number; // meters
  floodStatus: FloodStatus;
  timestamp: string;
  snapshotUrl: string;
  streamConfig?: StreamConfig;
  roiConfig: { x: number; y: number; width: number; height: number };
  hsvThresholds: {
    h_min: number;
    h_max: number;
    s_min: number;
    s_max: number;
    v_min: number;
    v_max: number;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  photoURL?: string;
  addedAt: string;
}

export function statusFromLevel(level: number): FloodStatus {
  if (level >= 1.5) return "DANGER";
  if (level >= 0.5) return "ALERT";
  return "NORMAL";
}