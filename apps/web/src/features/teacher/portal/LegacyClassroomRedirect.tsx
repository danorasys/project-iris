import { Navigate, useParams } from "react-router-dom";
import type { TeacherPortalState } from "./TeacherPortalPage";

/** `/teacher/classrooms/:classroomId` was the old page of a classroom. Now
 * the classroom opens inside the Portal Docente, so a saved link still
 * lands on it. */
export default function LegacyClassroomRedirect() {
  const { classroomId } = useParams();
  const state: TeacherPortalState = { section: "clases", classroomId };
  return <Navigate to="/teacher/portal" replace state={state} />;
}
