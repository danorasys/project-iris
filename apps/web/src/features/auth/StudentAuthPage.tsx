import { Navigate, Route, Routes } from "react-router-dom";
import StudentAuthIndex from "./student/StudentAuthIndex";

/** Handles everything under `/login/student/*`: the index page
 * ("Soy nuevo" | "Ya soy Mirador"). The tutor pages live at their own
 * top-level routes (`/login/guardian/new` and `/login/guardian/portal`, see
 * `AppRouter`) because they belong to the guardian, not the student. `new`
 * redirects to the registration for anyone hitting the old URL. The nested
 * `<Routes>` keeps this whole page lazy-loaded as one piece. */
export default function StudentAuthPage() {
  return (
    <Routes>
      <Route index element={<StudentAuthIndex />} />
      <Route path="new" element={<Navigate to="/login/guardian/new" replace />} />
    </Routes>
  );
}
