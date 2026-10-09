import { useNavigate } from "react-router-dom";
import type { Classroom } from "@iris/shared-types";
import { ClassroomAvatar } from "@/features/teacher/classrooms/ClassroomAvatar";
import { useAuth } from "@/shared/auth/useAuth";
import { useStudentClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useUnreadNotifications } from "@/shared/api/hooks/useNotifications";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { IconBell, IconSliders } from "@/shared/ui/icons";
import { Mascot } from "@/shared/ui/Mascot";
import { PagedChoices } from "../components/PagedChoices";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./ChoiceListPage.module.css";

// The tray is coral and Ajustes sol, so the classes take the other two.
const CLASS_VARIANTS = ["teal", "hoja"] as const;

// The first choice is always the tray; then one per class.
type Choice = { kind: "tray" } | { kind: "class"; classroom: Classroom };

/** `/student/home` (HU-53): a big button for their notifications, with how
 * many are new, then one per class they're in with its logo and name, three
 * at a time. "Ajustes" is always below. Joining a class is done by their
 * family from the parents' portal (ADR 0016). */
export default function HomePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const classrooms = useStudentClassrooms();
  const unread = useUnreadNotifications("student").data ?? 0;

  const settings = (
    <BigChoiceButton
      variant="sol"
      icon={<IconSliders width={36} height={36} />}
      onSelect={() => navigate("/student/settings")}
      dwellDurationMs={dwellDurationMs}
    >
      Ajustes
    </BigChoiceButton>
  );

  const list = classrooms.data ?? [];
  const choices: Choice[] = [{ kind: "tray" }, ...list.map((classroom) => ({ kind: "class" as const, classroom }))];
  const greeting = classrooms.isLoading
    ? "Buscando tus clases…"
    : classrooms.isError
      ? "No pudimos cargar tus clases. Inténtalo de nuevo en un momento."
      : list.length === 0
        ? "¡Hola! Todavía no estás en ninguna clase. Tu familia te inscribe desde su portal."
        : "¡Hola de nuevo! ¿A dónde quieres ir?";

  return (
    <PagedChoices
      items={classrooms.isLoading || classrooms.isError ? choices.slice(0, 1) : choices}
      getKey={(choice) => (choice.kind === "tray" ? "tray" : choice.classroom.id)}
      countLabel="Opciones"
      dwellDurationMs={dwellDurationMs}
      top={
        <Mascot mood={classrooms.isError ? "thinking" : "happy"} size="medium">
          {greeting}
        </Mascot>
      }
      render={(choice, index) =>
        choice.kind === "tray" ? (
          <BigChoiceButton
            variant="coral"
            icon={<IconBell width={36} height={36} />}
            badge={unread}
            badgeLabel={unread === 1 ? "nueva" : "nuevas"}
            onSelect={() => navigate("/student/notifications")}
            dwellDurationMs={dwellDurationMs}
          >
            Notificaciones
          </BigChoiceButton>
        ) : (
          <BigChoiceButton
            variant={CLASS_VARIANTS[index % CLASS_VARIANTS.length]}
            icon={
              <span className={styles.logo}>
                <ClassroomAvatar classroom={choice.classroom} size={56} />
              </span>
            }
            onSelect={() => navigate(`/student/classrooms/${choice.classroom.id}`)}
            dwellDurationMs={dwellDurationMs}
          >
            {choice.classroom.name}
          </BigChoiceButton>
        )
      }
      bottom={settings}
    />
  );
}
