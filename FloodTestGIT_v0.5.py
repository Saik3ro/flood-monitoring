import cv2
import numpy as np
import imutils
import time
from filterpy.kalman import KalmanFilter
from filterpy.common import Q_discrete_white_noise

# --- CONFIGURATION & CALIBRATION ---
TOTAL_PHYSICAL_HEIGHT = 1.50  # Total physical height of the marker in meters
CALIBRATION_SECONDS = 3.0
TRACKING_MARGIN = 80

# Kalman Filter Configuration
KALMAN_PROCESS_NOISE = 0.02  # Expected process noise (slow flood change)
KALMAN_MEASUREMENT_NOISE = 0.05  # Measurement noise from camera
ANOMALY_THRESHOLD = 0.15  # Residual threshold (meters) for anomaly detection
ANOMALY_MIN_CONFIRMED = 3  # Frames to confirm anomaly before display

COLOR_DICTS = {
    "green": {
        "lower": np.array([35, 70, 70]),
        "upper": np.array([85, 255, 255]),
        "color_bgr": (0, 255, 0),
    },
    "orange": {
        "lower": np.array([11, 100, 100]),
        "upper": np.array([25, 255, 255]),
        "color_bgr": (0, 165, 255),
    },
    "red": {
        "lower1": np.array([0, 100, 100]),
        "upper1": np.array([10, 255, 255]),
        "lower2": np.array([170, 100, 100]),
        "upper2": np.array([180, 255, 255]),
        "color_bgr": (0, 0, 255),
    },
}

CAMERA_SOURCE = 0
roi_box = None

# Dynamic calibration globals
calibrated_top_y = None
calibrated_height_px = None
calibration_active = False
calibration_start_time = None
calibration_samples = []
locked_marker = None
learned_color_profiles = None
color_profile_samples = {}

# Kalman Filter globals
kalman_filter = None
anomaly_counter = 0
is_anomaly = False
flood_level_state = "SAFE"


def initialize_kalman_filter():
    """Initialize a Kalman filter for flood depth tracking."""
    kf = KalmanFilter(dim_x=2, dim_z=1)
    
    # State: [depth, depth_velocity]
    kf.x = np.array([[0.0], [0.0]])
    
    # State transition matrix (constant velocity model)
    kf.F = np.array([[1.0, 1.0],
                     [0.0, 1.0]])
    
    # Measurement matrix (we only measure depth, not velocity)
    kf.H = np.array([[1.0, 0.0]])
    
    # Measurement noise
    kf.R = np.array([[KALMAN_MEASUREMENT_NOISE ** 2]])
    
    # Process noise (covariance of the process)
    q = Q_discrete_white_noise(dim=2, dt=1.0, var=KALMAN_PROCESS_NOISE ** 2)
    kf.Q = q
    
    # Initial state covariance
    kf.P = np.eye(2) * 0.1
    
    return kf


def update_kalman_filter(kf, measured_depth):
    """Update Kalman filter with measured depth and detect anomalies."""
    global anomaly_counter, is_anomaly
    
    # Predict
    kf.predict()
    
    # Update with measurement
    kf.update(np.array([[measured_depth]]))
    
    # Calculate residual (innovation)
    predicted_depth = kf.x[0, 0]
    residual = abs(measured_depth - predicted_depth)
    
    # Check for anomaly
    if residual > ANOMALY_THRESHOLD:
        anomaly_counter += 1
        if anomaly_counter >= ANOMALY_MIN_CONFIRMED:
            is_anomaly = True
    else:
        anomaly_counter = max(0, anomaly_counter - 1)
        if anomaly_counter == 0:
            is_anomaly = False
    
    return residual, is_anomaly


def check_roi_danger_level(bands):
    """
    Hierarchical flood level detection based on marker color visibility:
    
    SAFE:     All 3 colors present (GREEN, ORANGE, RED)
    ALERT:    GREEN covered, ORANGE + RED visible
    DANGER:   GREEN + ORANGE covered, RED visible only
    OVERFLOW: No marker colors visible, but other colors detected (water overflowed marker)
    """
    if not bands:
        return "OVERFLOW"  # No colors detected at all
    
    detected_colors = set(bands.keys())
    required_colors = {"green", "orange", "red"}
    
    # Check if all 3 marker colors are present
    if required_colors.issubset(detected_colors):
        return "SAFE"
    
    # Check if GREEN is missing but ORANGE and RED are present
    if "orange" in detected_colors and "red" in detected_colors and "green" not in detected_colors:
        return "ALERT"
    
    # Check if GREEN and ORANGE are missing but RED is present
    if "red" in detected_colors and "green" not in detected_colors and "orange" not in detected_colors:
        return "DANGER"
    
    # If no marker colors visible but other colors are detected = OVERFLOW
    if len(detected_colors) > 0 and not required_colors.intersection(detected_colors):
        return "OVERFLOW"
    
    # Any other incomplete state = ALERT (safer default)
    return "ALERT"


def estimate_color_bounds_from_patch(hsv_patch):
    """Estimate color bounds from a detected color patch."""
    if hsv_patch.size == 0:
        return None

    h_vals = hsv_patch[:, :, 0].astype(np.int32).ravel()
    s_vals = hsv_patch[:, :, 1].astype(np.int32).ravel()
    v_vals = hsv_patch[:, :, 2].astype(np.int32).ravel()

    h_mean = float(np.mean(h_vals))
    s_mean = float(np.mean(s_vals))
    v_mean = float(np.mean(v_vals))

    lower = np.array([
        max(0, int(h_mean - 12)),
        max(0, int(s_mean - 45)),
        max(0, int(v_mean - 45)),
    ], dtype=np.int32)

    upper = np.array([
        min(179, int(h_mean + 12)),
        min(255, int(s_mean + 45)),
        min(255, int(v_mean + 45)),
    ], dtype=np.int32)

    return {"lower": lower, "upper": upper}


def estimate_red_profile_from_patch(hsv_patch):
    """Estimate a red profile from a detected red patch."""
    if hsv_patch.size == 0:
        return None

    h_vals = hsv_patch[:, :, 0].astype(np.int32).ravel()
    h_mean = float(np.mean(h_vals))
    h_half = max(8, int(abs(h_mean - 180) if h_mean > 90 else abs(h_mean)))

    lower1 = np.array([max(0, int(h_mean - h_half)), 100, 100], dtype=np.int32)
    upper1 = np.array([min(179, int(h_mean + h_half)), 255, 255], dtype=np.int32)
    lower2 = np.array([max(0, int(h_mean + 180 - h_half)), 100, 100], dtype=np.int32)
    upper2 = np.array([min(179, int(h_mean + 180 + h_half)), 255, 255], dtype=np.int32)
    return {"lower1": lower1, "upper1": upper1, "lower2": lower2, "upper2": upper2}


def get_color_visibility(roi_hsv, roi_x, roi_y, search_box=None, color_profiles=None):
    """Detect colors inside the target ROI or a local search window."""
    visible_bands = {}

    if search_box is None:
        sx, sy, sw, sh = 0, 0, roi_hsv.shape[1], roi_hsv.shape[0]
    else:
        search_x, search_y, search_w, search_h = search_box
        sx = max(0, search_x - roi_x)
        sy = max(0, search_y - roi_y)
        ex = min(roi_hsv.shape[1], sx + search_w)
        ey = min(roi_hsv.shape[0], sy + search_h)
        sx, sy, sw, sh = sx, sy, ex - sx, ey - sy

    if sw <= 0 or sh <= 0:
        return visible_bands

    search_roi = roi_hsv[sy:sy + sh, sx:sx + sw]

    for color_name, base_bounds in COLOR_DICTS.items():
        if color_profiles is not None and color_name in color_profiles:
            bounds = color_profiles[color_name]
        else:
            bounds = base_bounds

        if color_name == "red":
            mask1 = cv2.inRange(search_roi, bounds["lower1"], bounds["upper1"])
            mask2 = cv2.inRange(search_roi, bounds["lower2"], bounds["upper2"])
            mask = cv2.bitwise_or(mask1, mask2)
        else:
            mask = cv2.inRange(search_roi, bounds["lower"], bounds["upper"])

        mask = cv2.erode(mask, None, iterations=2)
        mask = cv2.dilate(mask, None, iterations=2)

        cnts = cv2.findContours(mask.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cnts = imutils.grab_contours(cnts)

        if len(cnts) > 0:
            c = max(cnts, key=cv2.contourArea)
            if cv2.contourArea(c) > 100:
                bx, by, bw, bh = cv2.boundingRect(c)
                visible_bands[color_name] = (roi_x + sx + bx, roi_y + sy + by, bw, bh)

    return visible_bands


def is_consistent_marker_layout(bands):
    """Require the expected red-orange-green vertical structure."""
    if not bands or len(bands) < 3:
        return False
    if "green" not in bands or "orange" not in bands or "red" not in bands:
        return False

    red_box = bands["red"]
    orange_box = bands["orange"]
    green_box = bands["green"]

    if not (red_box[1] <= orange_box[1] <= green_box[1]):
        return False

    if (green_box[1] + green_box[3]) - red_box[1] <= 20:
        return False

    return True


def build_marker_signature(bands):
    """Create a stable marker signature from a consistent band layout."""
    if not is_consistent_marker_layout(bands):
        return None

    min_x = min(box[0] for box in bands.values())
    min_y = min(box[1] for box in bands.values())
    max_x = max(box[0] + box[2] for box in bands.values())
    max_y = max(box[1] + box[3] for box in bands.values())

    top_y = bands["red"][1]
    bottom_y = bands["green"][1] + bands["green"][3]
    ref_height = max(1, bottom_y - top_y)

    return {
        "bands": bands,
        "bbox": (min_x, min_y, max_x - min_x, max_y - min_y),
        "ref_top": top_y,
        "ref_height": ref_height,
    }


def average_marker_signature(samples):
    """Average several observations during calibration."""
    if not samples:
        return None

    averaged_bands = {}
    for color_name in ["green", "orange", "red"]:
        color_samples = [sample["bands"][color_name] for sample in samples if color_name in sample["bands"]]
        if not color_samples:
            continue
        xs = [box[0] for box in color_samples]
        ys = [box[1] for box in color_samples]
        ws = [box[2] for box in color_samples]
        hs = [box[3] for box in color_samples]
        averaged_bands[color_name] = (
            int(np.mean(xs)),
            int(np.mean(ys)),
            int(np.mean(ws)),
            int(np.mean(hs)),
        )

    if not averaged_bands:
        return None

    min_x = min(box[0] for box in averaged_bands.values())
    min_y = min(box[1] for box in averaged_bands.values())
    max_x = max(box[0] + box[2] for box in averaged_bands.values())
    max_y = max(box[1] + box[3] for box in averaged_bands.values())

    top_y = averaged_bands["red"][1]
    bottom_y = averaged_bands["green"][1] + averaged_bands["green"][3]
    ref_height = max(1, bottom_y - top_y)

    return {
        "bands": averaged_bands,
        "bbox": (min_x, min_y, max_x - min_x, max_y - min_y),
        "ref_top": top_y,
        "ref_height": ref_height,
    }


def get_tracking_search_box(marker_bbox, frame_shape, margin=80):
    """Create a tight local search window around the last known marker location."""
    if marker_bbox is None:
        return None

    x, y, w, h = marker_bbox
    x = max(0, int(x - margin))
    y = max(0, int(y - margin))
    w = min(frame_shape[1] - x, int(w + (margin * 2)))
    h = min(frame_shape[0] - y, int(h + (margin * 2)))
    return (x, y, w, h)


def update_learned_color_profiles(hsv_frame, bands, current_profiles):
    """Learn tighter color ranges from the detected marker bands."""
    global color_profile_samples

    if not bands:
        return current_profiles

    updated_profiles = {} if current_profiles is None else dict(current_profiles)

    for color_name, box in bands.items():
        bx, by, bw, bh = box
        if bw <= 0 or bh <= 0:
            continue

        patch = hsv_frame[by:by + bh, bx:bx + bw]
        if color_name == "red":
            bounds = estimate_red_profile_from_patch(patch)
        else:
            bounds = estimate_color_bounds_from_patch(patch)

        if bounds is None:
            continue

        if color_name not in color_profile_samples:
            color_profile_samples[color_name] = []
        color_profile_samples[color_name].append(bounds)

        if len(color_profile_samples[color_name]) > 8:
            color_profile_samples[color_name] = color_profile_samples[color_name][-8:]

        if color_name == "red":
            lowers1 = [sample["lower1"] for sample in color_profile_samples[color_name]]
            uppers1 = [sample["upper1"] for sample in color_profile_samples[color_name]]
            lowers2 = [sample["lower2"] for sample in color_profile_samples[color_name]]
            uppers2 = [sample["upper2"] for sample in color_profile_samples[color_name]]
            updated_profiles[color_name] = {
                "lower1": np.mean(lowers1, axis=0).astype(np.int32),
                "upper1": np.mean(uppers1, axis=0).astype(np.int32),
                "lower2": np.mean(lowers2, axis=0).astype(np.int32),
                "upper2": np.mean(uppers2, axis=0).astype(np.int32),
            }
        else:
            lowers = [sample["lower"] for sample in color_profile_samples[color_name]]
            uppers = [sample["upper"] for sample in color_profile_samples[color_name]]
            updated_profiles[color_name] = {
                "lower": np.mean(lowers, axis=0).astype(np.int32),
                "upper": np.mean(uppers, axis=0).astype(np.int32),
            }

    return updated_profiles


def calculate_continuous_depth(bands, ref_top, ref_height):
    """Convert visible marker height into a real-time flood depth in meters."""
    if not bands or ref_height <= 0:
        return 0.00

    current_bottom_y = max(box[1] + box[3] for box in bands.values())
    visible_px = current_bottom_y - ref_top
    visible_px = max(0, min(visible_px, ref_height))

    submerged_ratio = 1.0 - (visible_px / ref_height)
    depth = submerged_ratio * TOTAL_PHYSICAL_HEIGHT
    return depth


def get_flood_level(depth):
    if depth <= 0.50:
        return "GREEN", (0, 255, 0), "Level: GREEN (0-0.5m)"
    elif depth < 1.00:
        return "ORANGE", (0, 165, 255), "Level: ORANGE (0.5-1.0m)"
    else:
        return "RED", (0, 0, 255), "Level: RED (1.0m+)"


def main():
    global roi_box, calibrated_top_y, calibrated_height_px, calibration_active, calibration_start_time, calibration_samples, locked_marker, learned_color_profiles, color_profile_samples, kalman_filter, anomaly_counter, is_anomaly, flood_level_state
    cap = cv2.VideoCapture(CAMERA_SOURCE)

    print("\n--- FLOOD MONITORING SYSTEM WITH CONTINUOUS TELEMETRY ---")
    print("Press 'r' to MANUALLY select a target ROI marker box.")
    print("Press 'c' to CLEAR manual ROI and go back to Automatic.")
    print("Press 'q' to EXIT the program.")
    print("\n=== FLOOD LEVEL DETECTION (Slow-Moving Water) ===")
    print("SAFE:     All 3 colors (GREEN, ORANGE, RED) visible")
    print("ALERT:    GREEN covered, ORANGE + RED visible (water rising)")
    print("DANGER:   GREEN + ORANGE covered, RED visible only (critical)")
    print("OVERFLOW: No marker colors visible (completely submerged)")
    print("\n=== ANOMALY DETECTION (Fast Movement) ===")
    print("Kalman Filter detects sudden/fast movements (cars, debris)")
    print("Shows: OBJECT ANOMALY DETECTED with residual value\n")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame = imutils.resize(frame, width=700)
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

        if roi_box is not None:
            rx, ry, rw, rh = roi_box
            rx, ry = max(0, rx), max(0, ry)
            rw = min(rw, frame.shape[1] - rx)
            rh = min(rh, frame.shape[0] - ry)
            roi_hsv = hsv[ry:ry + rh, rx:rx + rw]
            cv2.rectangle(frame, (rx, ry), (rx + rw, ry + rh), (255, 255, 0), 2)
        else:
            roi_hsv = hsv
            rx, ry = 0, 0
            rh, rw = frame.shape[0], frame.shape[1]

        if locked_marker is None:
            bands = get_color_visibility(roi_hsv, rx, ry, color_profiles=learned_color_profiles)
        else:
            search_box = get_tracking_search_box(locked_marker["bbox"], frame.shape, TRACKING_MARGIN)
            bands = get_color_visibility(roi_hsv, rx, ry, search_box=search_box, color_profiles=learned_color_profiles)
        
        # Keep current detected bands separate from fallback bands for visualization
        current_detected_bands = bands.copy()
        
        # Only use fallback for visualization if no colors detected at all
        if not bands and locked_marker is not None:
            bands = locked_marker["bands"]

        if locked_marker is None and calibration_start_time is None:
            calibration_active = True
            calibration_start_time = time.monotonic()
            calibration_samples = []
            color_profile_samples = {}
            learned_color_profiles = None

        if locked_marker is None:
            if is_consistent_marker_layout(bands):
                marker_signature = build_marker_signature(bands)
                if marker_signature is not None:
                    calibration_samples.append(marker_signature)
                learned_color_profiles = update_learned_color_profiles(hsv, bands, learned_color_profiles)

            elapsed = time.monotonic() - calibration_start_time if calibration_start_time is not None else 0
            if elapsed >= CALIBRATION_SECONDS:
                if calibration_samples:
                    locked_marker = average_marker_signature(calibration_samples)
                else:
                    locked_marker = build_marker_signature(bands)

                if locked_marker is not None:
                    calibrated_top_y = int(locked_marker["ref_top"])
                    calibrated_height_px = int(locked_marker["ref_height"])
                calibration_active = False
                calibration_start_time = None

        ref_top = calibrated_top_y if calibrated_top_y is not None else ry
        ref_height = calibrated_height_px if calibrated_height_px is not None else rh

        min_x, min_y = float('inf'), float('inf')
        max_x, max_y = float('-inf'), float('-inf')

        if len(bands) > 0:
            for color_name, box in bands.items():
                bx, by, bw, bh = box
                cv2.rectangle(frame, (bx, by), (bx + bw, by + bh), COLOR_DICTS[color_name]["color_bgr"], 1)
                min_x = min(min_x, bx)
                min_y = min(min_y, by)
                max_x = max(max_x, bx + bw)
                max_y = max(max_y, by + bh)

            cv2.rectangle(frame, (min_x, min_y), (max_x, max_y), (255, 0, 255), 2)
            cv2.putText(frame, "Tracked Marker", (min_x, min_y - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 0, 255), 1)

        depth = calculate_continuous_depth(bands, ref_top, ref_height)

        # Initialize Kalman filter after marker is locked
        if kalman_filter is None and locked_marker is not None and not calibration_active:
            kalman_filter = initialize_kalman_filter()
            kalman_filter.x[0, 0] = depth  # Initialize with first measured depth

        # Update Kalman filter and detect anomalies
        residual = 0.0
        if kalman_filter is not None and len(bands) > 0:
            residual, is_anomaly = update_kalman_filter(kalman_filter, depth)

        # Check for flood level state (SAFE, ALERT, DANGER, OVERFLOW)
        flood_level_state = check_roi_danger_level(current_detected_bands)

        if len(bands) > 0:
            current_water_line_y = max(box[1] + box[3] for box in bands.values())
            line_start_x = min_x if min_x != float('inf') else rx
            line_end_x = max_x if max_x != float('-inf') else (rx + rw)
            if depth <= 0.50:
                line_color = (0, 255, 0)
            elif depth < 1.00:
                line_color = (0, 165, 255)
            else:
                line_color = (0, 0, 255)

            cv2.line(frame, (line_start_x - 15, current_water_line_y), (line_end_x + 15, current_water_line_y), line_color, 2)
            cv2.putText(frame, f"Water Surface: {depth:.2f}m", (line_end_x + 20, current_water_line_y + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, line_color, 2)

        if locked_marker is None and calibration_active:
            status_text = "STATUS: CALIBRATING"
            status_color = (255, 255, 0)
            depth_display = "Depth: 0.00m | Level: CALIBRATING"
        elif len(bands) == 0:
            status_text = "STATUS: NO MARKER FOUND"
            status_color = (0, 0, 255)
            depth_display = "Depth: 0.00m | Level: UNKNOWN"
        else:
            if is_anomaly:
                status_text = "⚠ OBJECT ANOMALY DETECTED!"
                status_color = (0, 165, 255)  # Cyan for anomaly
                depth_display = f"Depth: {depth:.2f}m | Residual: {residual:.3f}m | FAST MOVEMENT (Car/Object)"
            elif flood_level_state == "OVERFLOW":
                status_text = "FLOOD OVERFLOWING!"
                status_color = (0, 0, 255)  # Bright red
                depth_display = f"Depth: {depth:.2f}m | ALL MARKER COLORS SUBMERGED - CRITICAL OVERFLOW!"
            elif flood_level_state == "DANGER":
                status_text = "🚨 DANGER - CRITICAL FLOOD!"
                status_color = (0, 0, 255)  # Bright red
                depth_display = f"Depth: {depth:.2f}m | RED ONLY VISIBLE - IMMEDIATE EVACUATION!"
            elif flood_level_state == "ALERT":
                status_text = "⚠ ALERT - RISING FLOOD!"
                status_color = (0, 165, 255)  # Cyan
                depth_display = f"Depth: {depth:.2f}m | GREEN COVERED - WATER RISING SLOWLY!"
            else:  # SAFE
                level_name, level_color, level_text = get_flood_level(depth)
                status_text = f"STATUS: {level_name} - SAFE"
                status_color = level_color
                depth_display = f"Depth: {depth:.2f}m | {level_text}"

        cv2.rectangle(frame, (0, 0), (frame.shape[1], 80), (0, 0, 0), -1)
        cv2.putText(frame, status_text, (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)
        cv2.putText(frame, depth_display, (20, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        cv2.imshow("Flood Detection System", frame)
        key = cv2.waitKey(1) & 0xFF

        if key == ord('q'):
            break
        elif key == ord('r'):
            init_roi = cv2.selectROI("Flood Detection System", frame, fromCenter=False, showCrosshair=True)
            if init_roi[2] > 0 and init_roi[3] > 0:
                roi_box = init_roi
                calibrated_top_y = None
                calibrated_height_px = None
                calibration_active = True
                calibration_start_time = None
                calibration_samples = []
                locked_marker = None
                learned_color_profiles = None
                color_profile_samples = {}
                kalman_filter = None
                anomaly_counter = 0
                is_anomaly = False
                flood_level_state = "SAFE"
        elif key == ord('c'):
            roi_box = None
            calibrated_top_y = None
            calibrated_height_px = None
            calibration_active = True
            calibration_start_time = None
            calibration_samples = []
            locked_marker = None
            learned_color_profiles = None
            color_profile_samples = {}
            kalman_filter = None
            anomaly_counter = 0
            is_anomaly = False
            flood_level_state = "SAFE"

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()