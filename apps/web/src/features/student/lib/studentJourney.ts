// The order a kid goes through when they enter IRIS. They always move with
// their eyes, so the calibration comes first, with the tutor's session, and
// they pick their profile and write their PIN with the eyes too:
//   Portal Peques → [conditions → camera (first time on this device)]
//   → calibration → profiles → PIN → tour (first time) → home
// What was done is remembered on this device (localStorage).

const DEVICE_READY_KEY = "iris_equipo_listo";
const TOUR_PREFIX = "iris_recorrido_hecho_";
// Set by an older version once the tour was seen: it means the same.
const LEGACY_TOUR_PREFIX = "iris_recorrido_visto_";

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function mark(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Storage unavailable: the step just shows again next time.
  }
}

/** The camera was already set up and calibrated once on this device. */
export function isDeviceReady(): boolean {
  return read(DEVICE_READY_KEY);
}

export function markDeviceReady(): void {
  mark(DEVICE_READY_KEY);
}

export function isTourDone(profileId: string): boolean {
  return read(TOUR_PREFIX + profileId) || read(LEGACY_TOUR_PREFIX + profileId);
}

export function markTourDone(profileId: string): void {
  mark(TOUR_PREFIX + profileId);
}

/** From "Portal Peques": every time starts by calibrating. */
export function routeIntoKids(): string {
  return isDeviceReady() ? "/kids/calibration" : "/kids/setup-conditions";
}

/** Right after the PIN: the tour the first time (HU-89), then home. */
export function routeAfterPin(profileId: string): string {
  return isTourDone(profileId) ? "/student/home" : "/student/tour";
}
