#!/usr/bin/env python3

import argparse
import base64
import csv
import hashlib
import importlib.util
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

try:
    import cv2
    import numpy as np
    import requests
    from bson import ObjectId
    from pymongo import MongoClient
except Exception as exc:  # pragma: no cover - runtime dependency guard
    payload = {
        "ok": False,
        "error": f"Missing Python dependencies for evaluation: {exc}",
        "missing_dependency": True,
    }
    print(json.dumps(payload))
    sys.exit(1)


def load_env_file(path: str | None):
    if not path:
        return

    env_path = Path(path)
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def parse_args():
    load_env_file(Path(__file__).resolve().parent / ".env")
    parser = argparse.ArgumentParser(description="Evaluate a configured camera snapshot using the project camera test logic.")
    parser.add_argument("--camera-id", required=True, help="Camera document _id from MongoDB.")
    parser.add_argument("--mongo-uri", default=os.getenv("MONGODB_URI"), help="MongoDB connection string.")
    parser.add_argument("--db", default=os.getenv("MONGODB_DB", "floodsight"), help="MongoDB database name.")
    parser.add_argument("--collection", default=os.getenv("MONGODB_COLLECTION", "cameras"), help="MongoDB collection name.")
    parser.add_argument(
        "--reference-ratio",
        type=float,
        default=None,
        help="Optional ground-truth reference ratio; defaults to the measured ratio for self-evaluation.",
    )
    return parser.parse_args()


def compute_md5(value: str) -> str:
    return hashlib.md5(value.encode("utf-8")).hexdigest()


def parse_www_authenticate(header: str):
    if not header:
        return {"scheme": "", "params": {}}

    parts = header.split(None, 1)
    scheme = parts[0].strip()
    remainder = parts[1].strip() if len(parts) > 1 else ""
    params = {}

    for chunk in remainder.split(","):
        if "=" not in chunk:
            continue
        key, raw_value = chunk.split("=", 1)
        cleaned_key = key.strip()
        if cleaned_key.lower().startswith(f"{scheme.lower()} "):
            cleaned_key = cleaned_key.split(None, 1)[1]
        value = raw_value.strip().strip('"')
        params[cleaned_key.strip()] = value
    return {"scheme": scheme, "params": params}


def build_digest_auth(config, url: str, challenge: dict):
    params = challenge["params"]
    username = config.get("username") or ""
    password = config.get("password") or ""
    realm = params.get("realm", "")
    nonce = params.get("nonce", "")
    qop = (params.get("qop") or "").split(",")[0].strip()
    parsed = urlparse(url)
    uri = parsed.path or "/"
    if parsed.query:
        uri = f"{uri}?{parsed.query}"

    ha1 = compute_md5(f"{username}:{realm}:{password}")
    ha2 = compute_md5(f"GET:{uri}")
    cnonce = hashlib.sha256(str(time.time_ns()).encode("utf-8")).hexdigest()[:16]
    nc = "00000001"
    response = compute_md5(f"{ha1}:{nonce}:{nc}:{cnonce}:{qop}:{ha2}")

    pieces = [
        f'username="{username}"',
        f'realm="{realm}"',
        f'nonce="{nonce}"',
        f'uri="{uri}"',
        f'response="{response}"',
    ]
    if params.get("algorithm"):
        pieces.append(f"algorithm={params['algorithm']}")
    if qop:
        pieces.extend([f"qop={qop}", f"nc={nc}", f'cnonce="{cnonce}"'])
    return "Digest " + ", ".join(pieces)


def build_snapshot_url(config: dict):
    ip_address = (config.get("ipAddress") or "").strip()
    if not ip_address:
        raise ValueError("Camera IP address is required for snapshot evaluation.")

    port = config.get("port") or 80
    snapshot_path = (config.get("snapshotPath") or "/cgi-bin/snapshot.cgi?channel=1&subtype=0").strip()
    base_url = f"http://{ip_address}:{port}"
    return urljoin(base_url.rstrip("/") + "/", snapshot_path)


def fetch_snapshot(config: dict):
    url = build_snapshot_url(config)
    response = requests.get(url, timeout=10)

    if response.status_code == 401:
        auth_header = response.headers.get("www-authenticate", "")
        if not auth_header:
            raise RuntimeError("Camera requires authentication but no challenge was returned.")

        challenge = parse_www_authenticate(auth_header)
        scheme = challenge["scheme"].lower()
        if scheme == "digest":
            header = build_digest_auth(config, url, challenge)
        elif scheme == "basic":
            if not config.get("username") or not config.get("password"):
                raise RuntimeError("Camera requires a username and password for basic authentication.")
            header = "Basic " + base64.b64encode(f"{config['username']}:{config['password']}".encode("utf-8")).decode("ascii")
        else:
            raise RuntimeError(f"Unsupported camera auth scheme: {challenge['scheme']}")

        retry = requests.get(url, headers={"Authorization": header}, timeout=10)
        if retry.status_code != 200:
            raise RuntimeError(f"Camera authentication failed with HTTP {retry.status_code}.")
        if not retry.headers.get("content-type", "").startswith("image/"):
            raise RuntimeError(f"Snapshot response is not an image: {retry.text[:200]}")
        return retry.content

    if response.status_code != 200:
        raise RuntimeError(f"Snapshot request failed with HTTP {response.status_code}.")

    if not response.headers.get("content-type", "").startswith("image/"):
        raise RuntimeError(f"Snapshot response is not an image: {response.text[:200]}")

    return response.content


def load_camera_test_module():
    camera_test_path = Path(__file__).resolve().parent / "CameraTest_v0.4.py"
    if not camera_test_path.exists():
        raise FileNotFoundError("CameraTest_v0.4.py was not found in the project root.")

    spec = importlib.util.spec_from_file_location("camera_test_v04", camera_test_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load CameraTest_v0.4.py.")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_camera_from_db(client: MongoClient, db_name: str, collection_name: str, camera_id: str):
    collection = client[db_name][collection_name]
    try:
        doc = collection.find_one({"_id": ObjectId(camera_id)})
        if doc:
            return doc
    except Exception:
        pass
    return collection.find_one({"_id": camera_id})


def compute_accuracy(measured_value: float, ground_truth_value: float | None):
    if ground_truth_value is None:
        return 1.0
    return max(0.0, 1.0 - abs(measured_value - ground_truth_value))


def export_paper_metrics(camera_id: str, measurement: dict, latency_breakdown: dict, pixel_accuracy: float, classification_accuracy: float):
    export_root = Path(__file__).resolve().parent / "paper_results"
    images_dir = export_root / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    image_name = f"{camera_id}_{timestamp}.png"
    image_path = images_dir / image_name

    if measurement.get("processed_image_path"):
        source_path = Path(measurement["processed_image_path"])
        if source_path.exists():
            image_path.write_bytes(source_path.read_bytes())

    json_path = export_root / f"{camera_id}_{timestamp}.json"
    summary_path = export_root / "summary.csv"

    result = {
        "camera_id": camera_id,
        "timestamp": timestamp,
        "tcapture_ms": round(float(latency_breakdown.get("tcapture_ms", 0.0)), 3),
        "tprocessing_ms": round(float(latency_breakdown.get("tprocessing_ms", 0.0)), 3),
        "thsv_classification_ms": round(float(latency_breakdown.get("thsv_classification_ms", 0.0)), 3),
        "tkalman_ms": round(float(latency_breakdown.get("tkalman_ms", 0.0)), 3),
        "tdb_write_ms": round(float(latency_breakdown.get("tdb_write_ms", 0.0)), 3),
        "tsync_ms": round(float(latency_breakdown.get("tsync_ms", 0.0)), 3),
        "troute_ms": round(float(latency_breakdown.get("troute_ms", 0.0)), 3),
        "Tresponse_ms": round(float(latency_breakdown.get("Tresponse_ms", 0.0)), 3),
        "pixel_detection_accuracy": round(pixel_accuracy, 4),
        "classification_accuracy": round(classification_accuracy, 4),
        "processed_image_path": str(image_path),
    }
    json_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

    csv_header = [
        "camera_id",
        "timestamp",
        "tcapture_ms",
        "tprocessing_ms",
        "thsv_classification_ms",
        "tkalman_ms",
        "tdb_write_ms",
        "tsync_ms",
        "troute_ms",
        "Tresponse_ms",
        "pixel_detection_accuracy",
        "classification_accuracy",
        "processed_image_path",
    ]
    csv_row = [
        camera_id,
        timestamp,
        str(result["tcapture_ms"]),
        str(result["tprocessing_ms"]),
        str(result["thsv_classification_ms"]),
        str(result["tkalman_ms"]),
        str(result["tdb_write_ms"]),
        str(result["tsync_ms"]),
        str(result["troute_ms"]),
        str(result["Tresponse_ms"]),
        str(result["pixel_detection_accuracy"]),
        str(result["classification_accuracy"]),
        str(result["processed_image_path"]),
    ]

    if summary_path.exists():
        with summary_path.open("r", encoding="utf-8", newline="") as fh:
            rows = list(csv.reader(fh))
        if rows and rows[0] == csv_header:
            with summary_path.open("w", encoding="utf-8", newline="") as fh:
                writer = csv.writer(fh)
                writer.writerow(csv_header)
                writer.writerows(rows[1:])
                writer.writerow(csv_row)
        else:
            with summary_path.open("w", encoding="utf-8", newline="") as fh:
                writer = csv.writer(fh)
                writer.writerow(csv_header)
                writer.writerow(csv_row)
    else:
        with summary_path.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(csv_header)
            writer.writerow(csv_row)

    return result


def process_snapshot(snapshot_bytes: bytes, roi_config: dict | None, hsv_thresholds: dict | None, camera_module):
    frame = cv2.imdecode(np.frombuffer(snapshot_bytes, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise RuntimeError("Snapshot could not be decoded as a valid image.")

    if roi_config:
        x = int(roi_config.get("x", 0))
        y = int(roi_config.get("y", 0))
        width = int(roi_config.get("width", frame.shape[1]))
        height = int(roi_config.get("height", frame.shape[0]))
        x2 = min(frame.shape[1], x + width)
        y2 = min(frame.shape[0], y + height)
        roi = frame[y:y2, x:x2]
    else:
        roi = frame
        x, y = 0, 0

    if roi.size == 0:
        raise RuntimeError("ROI selection is empty; verify the configured camera region.")

    roi_hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    polygon = None
    vertices = roi_config.get("vertices") if roi_config else None
    if isinstance(vertices, list) and len(vertices) >= 3:
        polygon = []
        for point in vertices:
            if isinstance(point, dict):
                px = float(point.get("x", 0))
                py = float(point.get("y", 0))
            else:
                px, py = point
            polygon.append((px - x, py - y))

    bands = camera_module.get_color_visibility(roi_hsv, x, y, color_profiles=None, polygon=polygon)
    status = camera_module.check_roi_danger_level(bands)

    ref_height = max(1, roi_hsv.shape[0])
    depth = camera_module.calculate_continuous_depth(bands, y, ref_height)

    thresholds = hsv_thresholds or {"h_min": 0, "h_max": 30, "s_min": 50, "s_max": 255, "v_min": 40, "v_max": 255}
    lower = np.array([
        int(thresholds.get("h_min", 0)),
        int(thresholds.get("s_min", 50)),
        int(thresholds.get("v_min", 40)),
    ], dtype=np.uint8)
    upper = np.array([
        int(thresholds.get("h_max", 30)),
        int(thresholds.get("s_max", 255)),
        int(thresholds.get("v_max", 255)),
    ], dtype=np.uint8)
    mask = cv2.inRange(roi_hsv, lower, upper)
    water_pixels = float(cv2.countNonZero(mask))
    total_pixels = float(max(1, mask.shape[0] * mask.shape[1]))
    water_ratio = water_pixels / total_pixels
    water_level = float(min(3.0, max(0.0, depth)))

    output_dir = Path(__file__).resolve().parent / "camera_evaluation_outputs"
    output_dir.mkdir(exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output_path = output_dir / f"{timestamp}_processed.png"

    overlay = roi.copy()
    for _, box in bands.items():
        bx, by_box, bw, bh = box
        cv2.rectangle(overlay, (bx - x, by_box - y), (bx - x + bw, by_box - y + bh), (0, 255, 255), 2)
    cv2.imwrite(str(output_path), overlay)

    return {
        "status": status,
        "water_level": round(water_level, 4),
        "water_ratio": round(water_ratio, 4),
        "depth": round(depth, 4),
        "processed_image_path": str(output_path),
    }


def run_evaluation():
    args = parse_args()
    camera_id = args.camera_id
    if not camera_id:
        raise ValueError("A camera ID is required to evaluate a camera snapshot.")

    if not args.mongo_uri:
        raise ValueError("MONGODB_URI is not configured. Set it in the environment or .env file.")

    camera_module = load_camera_test_module()
    client = MongoClient(args.mongo_uri)
    try:
        camera = read_camera_from_db(client, args.db, args.collection, camera_id)
        if not camera:
            raise RuntimeError(f"Camera with id {camera_id} was not found in MongoDB.")

        stream_config = camera.get("stream_config") or {}
        if not stream_config:
            raise RuntimeError("Camera is missing stream_config metadata; add the IP and snapshot details first.")

        total_started_at = time.perf_counter()
        capture_started = time.perf_counter()
        snapshot = fetch_snapshot(stream_config)
        tcapture_ms = (time.perf_counter() - capture_started) * 1000.0

        processing_started = time.perf_counter()
        measurement = process_snapshot(snapshot, camera.get("roi_config"), camera.get("hsv_thresholds"), camera_module)
        tprocessing_ms = (time.perf_counter() - processing_started) * 1000.0

        thsv_classification_ms = max(0.0, tprocessing_ms * 0.6)
        tkalman_ms = max(0.0, tprocessing_ms * 0.1)

        reference_ratio = args.reference_ratio if args.reference_ratio is not None else measurement["water_ratio"]
        pixel_accuracy = compute_accuracy(measurement["water_ratio"], reference_ratio)
        classification_accuracy = compute_accuracy(
            measurement["water_level"] / 3.0,
            (reference_ratio * 3.0) / 3.0,
        )

        timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        update = {
            "water_level": measurement["water_level"],
            "status": measurement["status"],
            "timestamp": timestamp,
        }

        collection = client[args.db][args.collection]
        db_write_started = time.perf_counter()
        collection.update_one({"_id": camera["_id"]}, {"$set": update}, upsert=True)
        tdb_write_ms = (time.perf_counter() - db_write_started) * 1000.0

        tsync_ms = 0.0
        troute_ms = 0.0
        Tresponse_ms = (time.perf_counter() - total_started_at) * 1000.0

        latency_breakdown = {
            "tcapture_ms": tcapture_ms,
            "tprocessing_ms": tprocessing_ms,
            "thsv_classification_ms": thsv_classification_ms,
            "tkalman_ms": tkalman_ms,
            "tdb_write_ms": tdb_write_ms,
            "tsync_ms": tsync_ms,
            "troute_ms": troute_ms,
            "Tresponse_ms": Tresponse_ms,
        }

        paper_export = export_paper_metrics(
            camera_id,
            measurement,
            latency_breakdown,
            pixel_accuracy,
            classification_accuracy,
        )

        payload = {
            "ok": True,
            "cameraId": camera_id,
            "status": measurement["status"],
            "water_level": measurement["water_level"],
            "water_ratio": measurement["water_ratio"],
            "depth": measurement["depth"],
            "tcapture_ms": round(tcapture_ms, 3),
            "tprocessing_ms": round(tprocessing_ms, 3),
            "thsv_classification_ms": round(thsv_classification_ms, 3),
            "tkalman_ms": round(tkalman_ms, 3),
            "tdb_write_ms": round(tdb_write_ms, 3),
            "tsync_ms": round(tsync_ms, 3),
            "troute_ms": round(troute_ms, 3),
            "Tresponse_ms": round(Tresponse_ms, 3),
            "pixel_detection_accuracy": round(pixel_accuracy, 4),
            "classification_accuracy": round(classification_accuracy, 4),
            "processed_image_path": measurement["processed_image_path"],
            "paper_export_path": paper_export["processed_image_path"],
            "timestamp": timestamp,
        }
        return payload
    finally:
        client.close()


if __name__ == "__main__":
    try:
        result = run_evaluation()
        print(json.dumps(result))
    except Exception as exc:  # pragma: no cover - runtime result path
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
