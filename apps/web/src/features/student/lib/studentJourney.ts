import { getInputMode } from "@/shared/gaze/inputMode";

// The order a kid goes through when they enter IRIS (see the Fase 7 spec):
//   first time: [gaze: conditions → camera → calibration] → tour → home
//   other times: [gaze: calibration] → home
// The avatar isn't a step here: the family picks it from the parents' portal.
// What was done is remembered per profile on this device (localStorage).

const READY_PREFIX = "iris_perfil_listo_";
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

/** The kid already set up the camera and calibrated once on this device. */
export function isProfileReady(profileId: string): boolean {
  return read(READY_PREFIX + profileId);
}

export function markProfileReady(profileId: string): void {
  mark(READY_PREFIX + profileId);
}

export function isTourDone(profileId: string): boolean {
  return read(TOUR_PREFIX + profileId) || read(LEGACY_TOUR_PREFIX + profileId);
}

export function markTourDone(profileId: string): void {
  mark(TOUR_PREFIX + profileId);
}

const gaze = () => getInputMode() === "gaze";

/** Right after the PIN. With the gaze, every session starts by calibrating. */
export function routeAfterPin(profileId: string): string {
  if (!gaze()) return routeAfterCalibration(profileId);
  return isProfileReady(profileId) ? "/student/calibration" : "/student/setup-conditions";
}

/** Once the kid can move around: the tour the first time (HU-89), then home. */
export function routeAfterCalibration(profileId: string): string {
  return isTourDone(profileId) ? "/student/home" : "/student/tour";
}
