import { Route, Routes } from "react-router-dom";
import StudentAuthIndex from "./student/StudentAuthIndex";
import GuardianRegistrationWizard from "./student/GuardianRegistrationWizard";
import ProfileSelectorAuth from "./student/ProfileSelectorAuth";

/** Handles everything under `/login/student/*`: the index page
 * ("Soy nuevo" | "Ya soy Mirador"), the tutor registration wizard, and
 * the profile picker with PIN. We use a nested `<Routes>` here instead of
 * adding these routes to `AppRouter` directly, so this whole page can
 * still be lazy-loaded as one single piece. */
export default function StudentAuthPage() {
  return (
    <Routes>
      <Route index element={<StudentAuthIndex />} />
      <Route path="new" element={<GuardianRegistrationWizard />} />
      <Route path="profile" element={<ProfileSelectorAuth />} />
    </Routes>
  );
}
