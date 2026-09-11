import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { RequireRol } from "./RequireRol";
import { StudentGazeProvider } from "@/shared/gaze/GazeSourceContext";
import { GazeCursor } from "@/shared/ui/GazeCursor";
import { LoadingScreen } from "@/shared/ui/LoadingScreen";

// We split the code by role, so the /student/* pages, and the gaze
// engine that comes with them, only get downloaded if the user goes there.
const LandingPage = lazy(() => import("@/features/landing/LandingPage"));
const RoleSelectorPage = lazy(() => import("@/features/auth/RoleSelectorPage"));
const StudentAuthPage = lazy(() => import("@/features/auth/StudentAuthPage"));
const AdultAuthPage = lazy(() => import("@/features/auth/AdultAuthPage"));
const LegalNoticePage = lazy(() => import("@/features/legal/LegalNoticePage"));
const PrivacyPolicyPage = lazy(() => import("@/features/legal/PrivacyPolicyPage"));

const TourPage = lazy(() => import("@/features/student/pages/TourPage"));
const SetupConditionsPage = lazy(() => import("@/features/student/pages/SetupConditionsPage"));
const CameraPermissionPage = lazy(() => import("@/features/student/pages/CameraPermissionPage"));
const CalibrationPage = lazy(() => import("@/features/student/pages/CalibrationPage"));
const AvatarSelectionPage = lazy(() => import("@/features/student/pages/AvatarSelectionPage"));
const StudentHomePage = lazy(() => import("@/features/student/pages/HomePage"));
const EnterCodePage = lazy(() => import("@/features/student/pages/EnterCodePage"));
const StudentClassroomsPage = lazy(() => import("@/features/student/pages/ClassroomsPage"));
const LessonListPage = lazy(() => import("@/features/student/pages/LessonListPage"));
const LessonViewerPage = lazy(() => import("@/features/student/pages/LessonViewerPage"));

const TeacherDashboardPage = lazy(() => import("@/features/teacher/pages/DashboardPage"));
const CreateClassroomPage = lazy(() => import("@/features/teacher/pages/CreateClassroomPage"));
const ClassroomDetailPage = lazy(() => import("@/features/teacher/pages/ClassroomDetailPage"));
const LessonEditorPage = lazy(() => import("@/features/teacher/pages/LessonEditorPage"));

/** React Router doesn't reset scroll position on navigation the way a full
 * page load does, so without this, a page opened from deep down another
 * one (e.g. clicking a footer link) would keep the old scroll position. */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<RoleSelectorPage />} />
          <Route path="/login/student/*" element={<StudentAuthPage />} />
          <Route path="/login/adult/*" element={<AdultAuthPage />} />
          <Route path="/legal-notice" element={<LegalNoticePage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />

          <Route
            path="/student"
            element={
              <RequireRol role="student">
                <StudentGazeProvider>
                  <GazeCursor />
                  <Outlet />
                </StudentGazeProvider>
              </RequireRol>
            }
          >
            <Route index element={<Navigate to="home" replace />} />
            <Route path="tour" element={<TourPage />} />
            <Route path="setup-conditions" element={<SetupConditionsPage />} />
            <Route path="camera-permission" element={<CameraPermissionPage />} />
            <Route path="calibration" element={<CalibrationPage />} />
            <Route path="avatar" element={<AvatarSelectionPage />} />
            <Route path="home" element={<StudentHomePage />} />
            <Route path="enter-code" element={<EnterCodePage />} />
            <Route path="classrooms" element={<StudentClassroomsPage />} />
            <Route path="classrooms/:classroomId/lessons" element={<LessonListPage />} />
            <Route path="lessons/:lessonId" element={<LessonViewerPage />} />
          </Route>

          <Route
            path="/teacher"
            element={
              <RequireRol role="teacher">
                <Outlet />
              </RequireRol>
            }
          >
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home" element={<TeacherDashboardPage />} />
            <Route path="classrooms/create" element={<CreateClassroomPage />} />
            <Route path="classrooms/:classroomId" element={<ClassroomDetailPage />} />
            <Route path="classrooms/:classroomId/lessons/create" element={<LessonEditorPage />} />
            <Route path="classrooms/:classroomId/lessons/:lessonId/edit" element={<LessonEditorPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
