import { Navigate, Route, Routes } from "react-router-dom";
import StudentAuthIndex from "./student/StudentAuthIndex";
import ProfileSelectorAuth from "./student/ProfileSelectorAuth";

/** Handles everything under `/login/student/*`: the index page
 * ("Soy nuevo" | "Ya soy Mirador") and the profile picker with PIN. The
 * tutor registration wizard lives at its own top-level route,
 * `/login/guardian/new` (see `AppRouter`) — it's the guardian who registers,
 * not the student, so it doesn't belong under this path. `new` redirects
 * there for anyone hitting the old URL. We use a nested `<Routes>` here
 * instead of adding these routes to `AppRouter` directly, so this whole
 * page can still be lazy-loaded as one single piece. */
export default function StudentAuthPage() {
  return (
    <Routes>
      <Route index element={<StudentAuthIndex />} />
      <Route path="profile" element={<ProfileSelectorAuth />} />
      <Route path="new" element={<Navigate to="/login/guardian/new" replace />} />
    </Routes>
  );
}
