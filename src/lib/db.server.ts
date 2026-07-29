import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

import { statusFromLevel, type Camera, type FloodStatus } from "./subay/types";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB ?? "subay";
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
  timestamp?: string;
  stream_config?: {
    ipAddress: string;
    port?: number;
    username?: string;
    password?: string;
    snapshotPath?: string;
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

function locationLabel(location: RawCameraDoc["location"], index: number): string {
  if (typeof location === "string") return location;
  if (location?.type === "Point" && Array.isArray(location.coordinates)) {
    const [lng, lat] = location.coordinates;
    return `CCTV ${index + 1} · ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  return `CCTV ${index + 1}`;
}

function mapCamera(doc: RawCameraDoc, index: number): Camera {
  const waterLevel = typeof doc.water_level === "number" ? doc.water_level : 0;
  const location = locationLabel(doc.location, index);

  const coordinates =
    typeof doc.location === "object" && doc.location?.type === "Point" && Array.isArray(doc.location.coordinates)
      ? { lat: doc.location.coordinates[1], lng: doc.location.coordinates[0] }
      : { lat: 8.4822, lng: 124.6433 };

  return {
    id: doc._id.toString(),
    location,
    coordinates,
    waterLevel,
    floodStatus: normalizeFloodStatus(doc.status, waterLevel),
    timestamp: doc.timestamp ?? new Date().toISOString(),
    snapshotUrl: `https://picsum.photos/seed/${doc._id.toString().slice(-8)}/640/400`,
    streamConfig: doc.stream_config ?? undefined,
    roiConfig: { x: 110, y: 180, width: 320, height: 380 },
    hsvThresholds: { h_min: 0, h_max: 30, s_min: 50, s_max: 255, v_min: 40, v_max: 255 },
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

export async function updateCameraFeed(id: string, camera: Camera): Promise<Camera> {
  const client = await clientPromise;
  const db = client.db(MONGODB_DB);
  const collection = db.collection<RawCameraDoc>(MONGODB_COLLECTION);

  const setPayload: Record<string, unknown> = {
    location: camera.location,
    water_level: camera.waterLevel,
    status: camera.floodStatus,
    timestamp: camera.timestamp,
    coordinates: {
      type: "Point",
      coordinates: [camera.coordinates.lng, camera.coordinates.lat],
    },
    roi_config: camera.roiConfig,
    hsv_thresholds: camera.hsvThresholds,
  };

  if (camera.streamConfig !== undefined) {
    setPayload.stream_config = camera.streamConfig;
  }

  const result = await collection.updateOne(
    { _id: parseDocumentId(id) },
    {
      $set: setPayload,
    },
    { upsert: true },
  );

  if (result.matchedCount === 0 && result.upsertedId) {
    return camera;
  }

  return camera;
}
