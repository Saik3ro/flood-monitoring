import cv2
import numpy as np
import imutils
import time
from filterpy.kalman import KalmanFilter
from filterpy.common import Q_discrete_white_noise

# ============================================================================
# DAHUA CAMERA CONFIGURATION
# ============================================================================
# Camera Model: DH-IPC-HFW1230S1-S5 (Smart H.265+ IR Bullet Network Camera)
# Part Number: 1.0.01.04.36856
#
# Setup Instructions:
# 1. Replace CAMERA_IP with your camera's IP address (e.g., "192.168.1.100")
# 2. Replace CAMERA_USERNAME with your camera username (default is usually "admin")
# 3. Replace CAMERA_PASSWORD with your camera password
# 4. Adjust CAMERA_RTSP_PORT if not using default 554
# 5. Set USE_LOCAL_CAMERA = False to use the network camera
#
# Optional: To test locally first, set USE_LOCAL_CAMERA = True
# ============================================================================

USE_LOCAL_CAMERA = False  # Set to False when ready to use the Dahua camera
CAMERA_IP = "192.168.254.108"  # Replace with your camera's IP address
CAMERA_USERNAME = "admin"  # Replace with your camera username
CAMERA_PASSWORD = "admin1234"  # Replace with your camera password
CAMERA_RTSP_PORT = 554  # Default RTSP port for Dahua cameras
CAMERA_CHANNEL = 1  # Main stream channel (1 is primary)
CAMERA_SUBTYPE = 0  # 0 = main stream, 1 = sub stream

# Connection retry settings
MAX_CONNECTION_ATTEMPTS = 3
CONNECTION_TIMEOUT = 10  # seconds

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

roi_box = None
roi_polygon = None

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

# Camera connection globals
camera_connected = False
connection_error_msg = ""


# ============================================================================
# DAHUA CAMERA FUNCTIONS
# ============================================================================

def build_dahua_rtsp_url():
    """
    Build RTSP URL for Dahua camera.
    Format: rtsp://username:password@ip:port/cam/realmonitor?channel=X&subtype=Y
    """
    url = f"rtsp://{CAMERA_USERNAME}:{CAMERA_PASSWORD}@{CAMERA_IP}:{CAMERA_RTSP_PORT}/cam/realmonitor?channel={CAMERA_CHANNEL}&subtype={CAMERA_SUBTYPE}"
    return url


def connect_to_camera(use_local=True):
    """
    Attempt to connect to camera with retry logic.
    Returns cv2.VideoCapture object if successful, None otherwise.
    """
    global camera_connected, connection_error_msg
    
    if use_local:
        print("[INFO] Using local camera (device 0)")
        cap = cv2.VideoCapture(0)
        if cap.isOpened():
            camera_connected = True
            connection_error_msg = ""
            return cap
        else:
            camera_connected = False
            connection_error_msg = "Failed to open local camera"
            return None
    
    # Network camera connection with retries
    url = build_dahua_rtsp_url()
    print(f"[INFO] Connecting to Dahua camera at {CAMERA_IP}...")
    print(f"[INFO] RTSP URL: rtsp://{CAMERA_USERNAME}:****@{CAMERA_IP}:{CAMERA_RTSP_PORT}/...")
    
    for attempt in range(MAX_CONNECTION_ATTEMPTS):
        try:
            print(f"[ATTEMPT {attempt + 1}/{MAX_CONNECTION_ATTEMPTS}] Connecting to camera...")
            cap = cv2.VideoCapture(url)
            
            # Try to read a frame to verify connection
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize buffer for real-time streaming
            
            # Set timeout using GStreamer backend if available
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, CONNECTION_TIMEOUT * 1000)
            
            ret, frame = cap.read()
            
            if ret and frame is not None:
                print("[SUCCESS] Connected to Dahua camera!")
                camera_connected = True
                connection_error_msg = ""
                return cap
            else:
                print(f"[FAILED] Could not read frame from camera (attempt {attempt + 1})")
                cap.release()
                
        except Exception as e:
            print(f"[ERROR] Connection attempt {attempt + 1} failed: {str(e)}")
        
        # Wait before retrying
        if attempt < MAX_CONNECTION_ATTEMPTS - 1:
            time.sleep(2)
    
    camera_connected = False
    connection_error_msg = "Failed to connect to Dahua camera after multiple attempts"
    print(f"[ERROR] {connection_error_msg}")
    print("[TIP] Check camera IP, username, password, and network connectivity")
    return None


def reconnect_camera(cap):
    """
    Attempt to reconnect if connection is lost.
    Returns True if reconnection successful, False otherwise.
    """
    global camera_connected, connection_error_msg
    
    if cap is not None:
        cap.release()
    
    new_cap = connect_to_camera(use_local=USE_LOCAL_CAMERA)
    return new_cap if new_cap is not None and new_cap.isOpened() else None


# ============================================================================
# FLOOD DETECTION FUNCTIONS (Original Code)
# ============================================================================

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
    
    SAFE:     All 3 colors present OR GREEN block is visible (water level on GREEN)
    ALERT:    GREEN fully covered, ORANGE + RED visible (water level on ORANGE)
    DANGER:   GREEN and ORANGE fully covered, RED visible (water level on RED)
    OVERFLOW: All colors fully covered (water above all marker bands)
    """
    if not bands:
        return "OVERFLOW"  # No colors detected at all
    
    detected_colors = set(bands.keys())
    required_colors = {"green", "orange", "red"}
    
    # Priority 1: GREEN visible = water level on GREEN block = SAFE
    if "green" in detected_colors:
        return "SAFE"
    
    # Priority 2: GREEN covered, ORANGE visible = water level on ORANGE block = ALERT
    if "green" not in detected_colors and "orange" in detected_colors:
        return "ALERT"
    
    # Priority 3: GREEN and ORANGE covered, RED visible = water level on RED block = DANGER
    if "green" not in detected_colors and "orange" not in detected_colors and "red" in detected_colors:
        return "DANGER"
    
    # Priority 4: All colors covered = OVERFLOW
    return "OVERFLOW"


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


def get_color_visibility(roi_hsv, roi_x, roi_y, search_box=None, color_profiles=None, polygon=None):
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

    polygon_mask = None
    if polygon is not None:
        polygon_mask = np.zeros(roi_hsv.shape[:2], dtype=np.uint8)
        relative_polygon = np.array(
            [[int(point[0] - roi_x), int(point[1] - roi_y)] for point in polygon],
            dtype=np.int32,
        )
        cv2.fillPoly(polygon_mask, [relative_polygon], 255)
        polygon_mask = polygon_mask[sy:sy + sh, sx:sx + sw]

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

        if polygon_mask is not None:
            mask = cv2.bitwise_and(mask, polygon_mask)

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


def select_freeform_roi(frame):
    """Select a rectangle, then drag its corners to form an angled ROI."""
    window_name = "Select ROI - drag corners, Enter to accept, Esc to cancel"
    selection = {
        "start": None,
        "points": None,
        "drag_index": None,
        "drawing": False,
    }

    def mouse_callback(event, x, y, _flags, _param):
        if event == cv2.EVENT_LBUTTONDOWN:
            if selection["points"] is not None:
                distances = [np.hypot(point[0] - x, point[1] - y) for point in selection["points"]]
                nearest_index = int(np.argmin(distances))
                if distances[nearest_index] <= 25:
                    selection["drag_index"] = nearest_index
                    return
            selection["start"] = (x, y)
            selection["drawing"] = True

        elif event == cv2.EVENT_MOUSEMOVE:
            if selection["drag_index"] is not None:
                selection["points"][selection["drag_index"]] = (x, y)
            elif selection["drawing"] and selection["start"] is not None:
                start_x, start_y = selection["start"]
                left, right = sorted((start_x, x))
                top, bottom = sorted((start_y, y))
                selection["points"] = [(left, top), (right, top), (right, bottom), (left, bottom)]

        elif event == cv2.EVENT_LBUTTONUP:
            if selection["drag_index"] is not None:
                selection["drag_index"] = None
            elif selection["drawing"]:
                selection["drawing"] = False

    cv2.namedWindow(window_name)
    cv2.setMouseCallback(window_name, mouse_callback)

    while True:
        display = frame.copy()
        points = selection["points"]
        if points is not None:
            polygon = np.array(points, dtype=np.int32)
            cv2.polylines(display, [polygon], True, (255, 255, 0), 2)
            for point in points:
                cv2.circle(display, point, 6, (0, 255, 255), -1)
            cv2.putText(display, "Drag any corner to rotate/reshape", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        else:
            cv2.putText(display, "Drag to create ROI", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        cv2.imshow(window_name, display)
        key = cv2.waitKey(20) & 0xFF
        if key in (13, 32) and points is not None:
            x_values = [point[0] for point in points]
            y_values = [point[1] for point in points]
            bbox = (
                max(0, min(x_values)),
                max(0, min(y_values)),
                min(frame.shape[1], max(x_values)) - max(0, min(x_values)),
                min(frame.shape[0], max(y_values)) - max(0, min(y_values)),
            )
            cv2.destroyWindow(window_name)
            return bbox, points
        if key == 27:
            cv2.destroyWindow(window_name)
            return None, None


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
    global roi_box, roi_polygon, calibrated_top_y, calibrated_height_px, calibration_active, calibration_start_time, calibration_samples, locked_marker, learned_color_profiles, color_profile_samples, kalman_filter, anomaly_counter, is_anomaly, flood_level_state, camera_connected, connection_error_msg
    
    print("\n" + "="*70)
    print("FLOOD MONITORING SYSTEM - DAHUA CAMERA COMPATIBLE (v0.2)")
    print("="*70)
    print(f"[CONFIG] Camera Mode: {'LOCAL WEBCAM' if USE_LOCAL_CAMERA else 'DAHUA NETWORK CAMERA'}")
    if not USE_LOCAL_CAMERA:
        print(f"[CONFIG] Camera IP: {CAMERA_IP}")
        print(f"[CONFIG] RTSP Port: {CAMERA_RTSP_PORT}")
        print(f"[CONFIG] Channel: {CAMERA_CHANNEL}, Subtype: {CAMERA_SUBTYPE}")
    print("="*70 + "\n")
    
    # Connect to camera
    cap = connect_to_camera(use_local=USE_LOCAL_CAMERA)
    
    if cap is None or not cap.isOpened():
        print("[FATAL] Could not initialize camera. Exiting.")
        return
    
    print("\n--- FLOOD MONITORING SYSTEM WITH CONTINUOUS TELEMETRY ---")
    print("Press 'r' to select an ROI, then drag its corners to adjust the angle.")
    print("Press 'c' to CLEAR manual ROI and go back to Automatic.")
    print("Press 'q' to EXIT the program.")
    print("\n=== FLOOD LEVEL DETECTION (Slow-Moving Water) ===")
    print("SAFE:     GREEN block visible (water level on GREEN)")
    print("ALERT:    GREEN fully covered, ORANGE visible (water level on ORANGE)")
    print("DANGER:   GREEN and ORANGE fully covered, RED visible (water level on RED)")
    print("OVERFLOW: All colors fully covered (completely submerged)")
    print("\n=== ANOMALY DETECTION (Fast Movement) ===")
    print("Kalman Filter detects sudden/fast movements (cars, debris)")
    print("Shows: OBJECT ANOMALY DETECTED with residual value\n")

    frame_count = 0
    reconnect_attempts = 0
    
    while True:
        ret, frame = cap.read()
        
        # Handle connection loss
        if not ret or frame is None:
            reconnect_attempts += 1
            print(f"[WARNING] Frame read failed (attempt {reconnect_attempts})")
            
            if reconnect_attempts >= MAX_CONNECTION_ATTEMPTS:
                print("[ERROR] Lost connection to camera. Attempting to reconnect...")
                cap = reconnect_camera(cap)
                if cap is None:
                    print("[FATAL] Could not reconnect to camera. Exiting.")
                    break
                reconnect_attempts = 0
            else:
                time.sleep(1)
                continue
        
        reconnect_attempts = 0  # Reset on successful frame read
        frame_count += 1

        frame = imutils.resize(frame, width=700)
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

        if roi_box is not None:
            rx, ry, rw, rh = roi_box
            rx, ry = max(0, rx), max(0, ry)
            rw = min(rw, frame.shape[1] - rx)
            rh = min(rh, frame.shape[0] - ry)
            roi_hsv = hsv[ry:ry + rh, rx:rx + rw]
            if roi_polygon is not None:
                cv2.polylines(frame, [np.array(roi_polygon, dtype=np.int32)], True, (255, 255, 0), 2)
            else:
                cv2.rectangle(frame, (rx, ry), (rx + rw, ry + rh), (255, 255, 0), 2)
        else:
            roi_hsv = hsv
            rx, ry = 0, 0
            rh, rw = frame.shape[0], frame.shape[1]

        if locked_marker is None:
            bands = get_color_visibility(roi_hsv, rx, ry, color_profiles=learned_color_profiles, polygon=roi_polygon)
        else:
            search_box = get_tracking_search_box(locked_marker["bbox"], frame.shape, TRACKING_MARGIN)
            bands = get_color_visibility(roi_hsv, rx, ry, search_box=search_box, color_profiles=learned_color_profiles, polygon=roi_polygon)
        
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
                status_text = "ANOMALY DETECTED"
                status_color = (0, 165, 255)  # Cyan for anomaly
                depth_display = f"Depth: {depth:.2f}m | Residual: {residual:.3f}m"
            elif flood_level_state == "OVERFLOW":
                status_text = "OVERFLOW"
                status_color = (0, 0, 255)  # Bright red
                depth_display = f"Depth: {depth:.2f}m"
            elif flood_level_state == "DANGER":
                status_text = "DANGER"
                status_color = (0, 0, 255)  # Bright red
                depth_display = f"Depth: {depth:.2f}m"
            elif flood_level_state == "ALERT":
                status_text = "ALERT"
                status_color = (0, 165, 255)  # Cyan
                depth_display = f"Depth: {depth:.2f}m"
            else:  # SAFE
                status_text = "SAFE"
                status_color = (0, 255, 0)  # Green
                depth_display = f"Depth: {depth:.2f}m"

        # Add camera source info to display
        camera_info = "LOCAL CAMERA" if USE_LOCAL_CAMERA else f"DAHUA: {CAMERA_IP}"
        
        cv2.rectangle(frame, (0, 0), (frame.shape[1], 100), (0, 0, 0), -1)
        cv2.putText(frame, status_text, (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)
        cv2.putText(frame, depth_display, (20, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(frame, camera_info, (20, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        cv2.imshow("Flood Detection System - Dahua Camera (v0.2)", frame)
        key = cv2.waitKey(1) & 0xFF

        if key == ord('q'):
            break
        elif key == ord('r'):
            selected_box, selected_polygon = select_freeform_roi(frame)
            if selected_box is not None and selected_box[2] > 0 and selected_box[3] > 0:
                roi_box = selected_box
                roi_polygon = selected_polygon
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
            roi_polygon = None
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
    print("\n[INFO] Program exited successfully.")


if __name__ == "__main__":
    main()
