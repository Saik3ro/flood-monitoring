import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

import { statusFromLevel, type Camera, type FloodStatus } from "./floodsight/types";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB ?? "floodsight";
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION ?? "cameras";

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not configured in environment variables.");
}

declare global {
  // eslint-disable-next-line no-var
  var __mongoClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

const clientPromise: Promise<MongoClient> = (globalThis.__mongoClientPromise ??= new MongoClient(MONGODB_URI).connect());

type RawCameraDoc = {
  _id: { toString: () => string };
  status?: string;
  water_level?: number;
  location?: { type: string; coordinates: [number, number] } | string;
  location_label?: string;
  timestamp?: string;
  stream_config?: {
    ipAddress: string;
    port?: number;
    username?: string;
    password?: string;
    snapshotPath?: string;
  };
  roi_config?: {
    x: number;
    y: number;
    width: number;
    height: number;
    vertices?: Array<{ x: number; y: number }>;
  };
  hsv_thresholds?: {
    h_min: number;
    h_max: number;
    s_min: number;
    s_max: number;
    v_min: number;
    v_max: number;
  };
};

function normalizeFloodStatus(status: string | undefined, waterLevel: number): FloodStatus {
  if (typeof status === "string") {
    const normalized = status.toUpperCase();
    if (normalized === "DANGER") return "DANGER";
    if (normalized === "ALERT") return "ALERT";
  }
  return statusFromLevel(waterLevel);
}

function locationLabel(doc: RawCameraDoc, index: number): string {
  if (doc.location_label) return doc.location_label;
  if (typeof doc.location === "string") return doc.location;
  if (doc.location?.type === "Point" && Array.isArray(doc.location.coordinates)) {
    const [lng, lat] = doc.location.coordinates;
    return `CCTV ${index + 1} · ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  return `CCTV ${index + 1}`;
}

function mapCamera(doc: RawCameraDoc, index: number): Camera {
  const waterLevel = typeof doc.water_level === "number" ? doc.water_level : 0;
  const location = locationLabel(doc, index);

  const coordinates =
    typeof doc.location === "object" && doc.location?.type === "Point" && Array.isArray(doc.location.coordinates)
      ? { lat: doc.location.coordinates[1], lng: doc.location.coordinates[0] }
      : { lat: 8.4822, lng: 124.6433 };

  const roiConfig = doc.roi_config ?? {
    x: 110,
    y: 180,
    width: 320,
    height: 380,
    vertices: [
      { x: 110, y: 180 },
      { x: 430, y: 180 },
      { x: 430, y: 560 },
      { x: 110, y: 560 },
    ],
  };

  const cameraId = doc._id.toString();
  const hasStreamConfig = Boolean(doc.stream_config?.ipAddress);

  return {
    id: cameraId,
    location,
    coordinates,
    waterLevel,
    floodStatus: normalizeFloodStatus(doc.status, waterLevel),
    timestamp: doc.timestamp ?? new Date().toISOString(),
    snapshotUrl: hasStreamConfig ? `/api/cameras/${encodeURIComponent(cameraId)}/snapshot` : `https://picsum.photos/seed/${cameraId.slice(-8)}/640/400`,
    streamConfig: doc.stream_config ?? undefined,
    roiConfig,
    hsvThresholds: doc.hsv_thresholds ?? { h_min: 0, h_max: 30, s_min: 50, s_max: 255, v_min: 40, v_max: 255 },
  };
}

function parseDocumentId(id: string) {
  try {
    return new ObjectId(id);
  } catch {
    return id;
  }
}

async function findCameraCollection(db: ReturnType<MongoClient["db"]>) {
  const collections = await db.listCollections().toArray();

  for (const { name } of collections) {
    try {
      const collection = db.collection<RawCameraDoc>(name);
      const match = await collection.findOne({
        $or: [
          { water_level: { $exists: true } },
          { status: { $exists: true } },
          { "location.type": "Point" },
        ],
      });
      if (match) return collection;
    } catch {
      continue;
    }
  }
  return null;
}

export async function getCameraFeeds(): Promise<Camera[]> {
  const client = await clientPromise;
  const db = client.db(MONGODB_DB);
  let collection = db.collection<RawCameraDoc>(MONGODB_COLLECTION);

  let docs = await collection.find({}).toArray();
  if (!docs.length) {
    const fallback = await findCameraCollection(db);
    if (fallback) {
      collection = fallback;
      docs = await collection.find({}).toArray();
    }
  }

  return docs.map(mapCamera);
}

function buildCameraSetPayload(camera: Camera): Record<string, unknown> {
  const roiConfig = camera.roiConfig ?? {
    x: 110,
    y: 180,
    width: 320,
    height: 380,
    vertices: [
      { x: 110, y: 180 },
      { x: 430, y: 180 },
      { x: 430, y: 560 },
      { x: 110, y: 560 },
    ],
  };

  const setPayload: Record<string, unknown> = {
    location: {
      type: "Point",
      coordinates: [camera.coordinates.lng, camera.coordinates.lat],
    },
    location_label: camera.location,
    water_level: camera.waterLevel,
    status: camera.floodStatus,
    timestamp: camera.timestamp,
    roi_config: roiConfig,
    hsv_thresholds: camera.hsvThresholds,
  };

  if (camera.streamConfig !== undefined) {
    setPayload.stream_config = camera.streamConfig;
  }

  return setPayload;
}

export async function updateCameraFeed(id: string, camera: Camera): Promise<Camera> {
  const client = await clientPromise;
  const db = client.db(MONGODB_DB);
  const collection = db.collection<RawCameraDoc>(MONGODB_COLLECTION);

  await collection.updateOne(
    { _id: parseDocumentId(id) },
    { $set: buildCameraSetPayload(camera) },
    { upsert: true },
  );

  return camera;
}

export async function createCameraFeed(camera: Camera): Promise<Camera> {
  const client = await clientPromise;
  const db = client.db(MONGODB_DB);
  const collection = db.collection<RawCameraDoc>(MONGODB_COLLECTION);

  const doc = buildCameraSetPayload(camera) as RawCameraDoc;
  const result = await collection.insertOne(doc);

  return mapCamera({ ...doc, _id: result.insertedId }, 0);
}
