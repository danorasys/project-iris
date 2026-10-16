import { Outlet } from "react-router-dom";
import { StudentGazeProvider } from "@/shared/gaze/GazeSourceContext";
import { GazeCursor } from "@/shared/ui/GazeCursor";
import { usePortalTheme } from "@/shared/ui/portal/usePortalTheme";

/** Around everything the kid does with the eyes: the calibration and the
 * profiles (/kids, still with the tutor's session) and the kid's own screens
 * (/student). One gaze engine for all of it, so the calibration done before
 * picking the profile is the one used afterwards, with the blue cursor and
 * the colors of the portals of IRIS. */
export default function KidGazeLayout() {
  usePortalTheme();
  return (
    <StudentGazeProvider>
      <GazeCursor />
      <Outlet />
    </StudentGazeProvider>
  );
}
