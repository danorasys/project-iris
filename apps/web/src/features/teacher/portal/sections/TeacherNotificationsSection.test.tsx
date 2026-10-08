import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EnrollmentRequest, NotificationItem, NotificationPage } from "@iris/shared-types";
import { TeacherNotificationsSection } from "./TeacherNotificationsSection";

const markRead = vi.fn();
const resolveRequest = vi.fn();

const request: NotificationItem = {
  id: "n1",
  event: "request.created",
  classroom_id: "c1",
  enrollment_id: "e1",
  student_id: "s1",
  student_name: "Sofía",
  classroom_name: "Matemáticas Básicas",
  sender_name: "Ana Pérez",
  read: false,
  created_at: "2026-10-04T15:42:00Z",
};

const answered: NotificationItem = {
  ...request,
  id: "n2",
  event: "request.resolved",
  decision: "aceptada",
  enrollment_id: "e9",
  sender_name: null,
  read: true,
};

let pending: EnrollmentRequest[] = [];

vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useNotificationTray: (): { data: NotificationPage; isLoading: boolean; isError: boolean } => ({
    data: { items: [request, answered], total: 2, unread_count: 1, page: 1, page_size: 8 },
    isLoading: false,
    isError: false,
  }),
  useMarkNotificationRead: () => ({ mutateAsync: markRead }),
  useDeleteNotification: () => ({ mutateAsync: vi.fn() }),
  useDeleteNotifications: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useClassroomRequests: () => ({ data: pending, isLoading: false, isError: false }),
  useResolveRequest: () => ({ mutateAsync: resolveRequest, isPending: false }),
}));

vi.mock("@/shared/ui/StudentAvatarImage", () => ({ StudentAvatarImage: () => null }));

// Like the real mutation, marking as read returns a promise.
beforeEach(() => {
  markRead.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  pending = [];
  markRead.mockReset();
  resolveRequest.mockReset();
});

describe("Notificaciones del docente", { timeout: 20_000 }, () => {
  it("lists each one with its subject, classroom, sender and arrival, unread ones apart", () => {
    render(<TeacherNotificationsSection />);

    expect(screen.getByText("1 sin leer")).toBeTruthy();
    expect(screen.getByText("Nueva solicitud de ingreso")).toBeTruthy();
    // Who it's from comes first, and the unread one says so, not only with color.
    expect(screen.getByRole("button", { name: /^No leída:\s*Ana Pérez\s*Nueva solicitud de ingreso/ })).toBeTruthy();
    expect(screen.getByText(/Ana Pérez pidió que Sofía se una a la clase "Matemáticas Básicas"/)).toBeTruthy();
  });

  it("opens a pending request with the kid and the guardian, and accepts it", async () => {
    pending = [
      {
        enrollment_id: "e1",
        student_id: "s1",
        student_first_name: "Sofía",
        student_avatar_id: 1,
        guardian_name: "Ana Pérez",
        guardian_contact: "ana@example.com · 3001234567",
        requested_at: "2026-10-04T15:42:00Z",
      },
    ];
    resolveRequest.mockResolvedValue({ enrollment_id: "e1", status: "aceptada" });
    const user = userEvent.setup({ delay: null });
    render(<TeacherNotificationsSection />);

    await user.click(screen.getByRole("button", { name: /^No leída:\s*Ana Pérez\s*Nueva solicitud de ingreso/ }));

    expect(markRead).toHaveBeenCalledWith("n1");
    expect(screen.getByText("ana@example.com · 3001234567")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Aceptar" }));
    expect(resolveRequest).toHaveBeenCalledWith({ classroomId: "c1", enrollmentId: "e1", decision: "aceptar" });
    expect(await screen.findByText("Sofía ya es parte de la clase.")).toBeTruthy();
  });

  it("says when a request was already answered, without the buttons", async () => {
    const user = userEvent.setup({ delay: null });
    render(<TeacherNotificationsSection />);

    await user.click(screen.getByRole("button", { name: /^No leída:\s*Ana Pérez\s*Nueva solicitud de ingreso/ }));

    expect(screen.getByText("Esta solicitud ya fue respondida.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aceptar" })).toBeNull();
  });
});
