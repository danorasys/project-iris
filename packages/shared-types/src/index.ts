// Types derived from the API contract. JSON uses snake_case, and these
// types reflect the body exactly as it travels over the network, no
// camelCase transform, so there's no mapping layer that can drift out of
// sync with the backend.

export type Role = "student" | "teacher";

export type EnrollmentStatus = "pendiente" | "aceptada" | "rechazada";

// Kept in Spanish on purpose: these are the enum-like VALUES already stored
// in content-service's/classroom-service's database, not identifiers. Only
// the type/field names around them were translated in this phase.
export type LessonStatus = "borrador" | "publicada";

export type BlockType = ContentBlockInput["type"];

export interface ErrorApi {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface CurrentUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
}

/** The refresh token is not here: the server keeps it in an HttpOnly cookie
 * that the page's JavaScript can't read. */
export interface TokensAuth {
  access_token: string;
  token_type: "bearer";
}

export interface DocumentType {
  id: number;
  name: string;
}

export interface RelationshipType {
  id: number;
  name: string;
}

export interface SupportCondition {
  id: number;
  name: string;
}

export interface Avatar {
  /** The image is at `avatarImageUrl(id)`, see mediaPaths.ts. */
  id: number;
  name: string;
  /** Its main color, "#rrggbb": the kid's banner is painted with it. */
  accent_color: string;
}

export interface GuardianRegistrationRequest {
  guardian: {
    first_name: string;
    last_name: string;
    document_type_id: number;
    document_number: string;
    date_of_birth: string; // ISO date
    document_issued_at: string; // ISO date
    email: string;
    phone_country_code: string; // Calling code without "+", e.g. "57"
    phone_number: string; // National significant number, digits only, e.g. "3001234567"
    relationship_type_id: number;
    password: string;
    password_confirmation: string;
  };
  student: {
    first_name: string;
    last_name: string;
    date_of_birth: string; // ISO date
    avatar_id: number;
    pin: string;
    pin_confirmation: string;
    /** A kid can have several conditions: at least one id, none repeated. */
    support_condition_ids: number[];
    support_condition_other?: string; // Required only when "Otra condición (especificar)" is one of them
    additional_support_need?: string; // Always optional
  };
  consent: {
    policy_version: string;
    accepts_data_processing: boolean;
    authorizes_support_condition: boolean;
  };
}

export interface TeacherRegistrationRequest {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  /** Optional, not every teacher works for a school. */
  institution: string | null;
  document_type_id: number;
  document_number: string;
  date_of_birth: string; // ISO date
  /** Calling code without "+", e.g. "57". */
  phone_country_code: string;
  /** National number, digits only. */
  phone_number: string;
  document_issued_at: string; // ISO date
  consent: TeacherConsentRequest;
  /** Optional step of the registration, it can be filled in later. */
  profile?: TeacherProfile | null;
}

/** The teacher's acceptance of the treatment of their own data. */
export interface TeacherConsentRequest {
  policy_version: string;
  accepts_data_processing: boolean;
}

export type StudyLevel = "technical" | "technologist" | "professional" | "specialization" | "masters" | "doctorate";

/** Finished in `end_month` ("YYYY-MM"), or still in progress (then there's no end). */
export interface TeacherStudy {
  level: StudyLevel;
  title: string;
  institution: string;
  end_month: string | null;
  in_progress: boolean;
}

/** Months as "YYYY-MM". No `end_month` means they still work there. */
export interface TeacherExperience {
  role: string;
  place: string;
  start_month: string;
  end_month: string | null;
  description: string | null;
}

/** The teacher's own account (`GET /teachers/me`). Document and email are read-only. */
export interface TeacherAccount {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  document_type_id: number;
  document_number: string;
  document_issued_at: string | null;
  email: string;
  phone_country_code: string;
  phone_number: string;
  institution: string | null;
}

/** What a teacher tells the families about themselves. Everything is
 * optional, and it never has contact or ID data. */
export interface TeacherProfile {
  about: string | null;
  studies: TeacherStudy[];
  experiences: TeacherExperience[];
}

/** A teacher as a family sees them (HU-97): the name, the institution they
 * work for (if they gave one) and their profile. */
export interface TeacherPublicProfile extends TeacherProfile {
  first_name: string;
  last_name: string;
  institution: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface StudentProfileLoginRequest {
  student_id: string;
  pin: string;
}

/** What the profile picker and the list of kids get. That list works
 * without the portal's 2FA code, so nothing sensitive comes in it. */
export interface StudentProfile {
  id: string;
  first_name: string;
  avatar_id: number;
  date_of_birth: string;
}

/** Everything the guardian registered about a kid, only inside the portal. */
export interface StudentDetail extends StudentProfile {
  last_name: string;
  support_condition_ids: number[];
  support_condition_other: string | null;
  additional_support_need: string | null;
}

export interface UpdateStudentRequest {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  avatar_id: number;
  support_condition_ids: number[];
  support_condition_other: string | null;
  additional_support_need: string | null;
  /** Always true, same declaration as in the guardian's own profile. */
  truthful_declaration: true;
}

export interface CheckStudentPinRequest {
  current_pin: string;
}

/** A guardian sets a new PIN for one of their kids, with the current PIN
 * and a fresh code from the authenticator app. */
export interface ChangeStudentPinRequest {
  current_pin: string;
  code: string;
  pin: string;
  pin_confirmation: string;
}

export interface TotpSetupResponse {
  qr_code_data_uri: string;
  manual_entry_key: string;
}

export interface TotpVerifyRequest {
  code: string;
}

/** Whether the account already turned its 2FA on. */
export interface TotpStatus {
  enabled: boolean;
}

/** Answer of the portal 2FA check: wrong codes typed since the last good one. */
export interface PortalChallengeResponse {
  failed_attempts_before: number;
}

export interface GuardianProfile {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  document_type_id: number;
  document_number: string;
  document_issued_at: string;
  email: string;
  phone_country_code: string;
  phone_number: string;
  relationship_type_id: number;
}

export interface UpdateGuardianProfileRequest {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone_country_code: string;
  phone_number: string;
  relationship_type_id: number;
  /** Always true: the guardian declares the information they changed is
   * correct and true. The server rejects the request without it. */
  truthful_declaration: true;
}

/** What a teacher can change about themselves from Mi perfil (HU-71).
 * Document, email and issue date never change here. */
export interface UpdateTeacherAccountRequest {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone_country_code: string;
  phone_number: string;
  /** Empty or null: no institution. */
  institution: string | null;
  /** Always true, like the guardian's. */
  truthful_declaration: true;
}

export interface ChangePasswordRequest {
  current_password: string;
  /** A fresh code from the authenticator app, checked at the same moment. */
  code: string;
  password: string;
  password_confirmation: string;
}

/** The colors of a classroom's avatar: the initials of its name on one of them. */
export type ClassroomColor = "blue" | "navy" | "orange" | "green" | "gold";

/** What a classroom is about: the nine areas of Ley 115 (art. 23) plus "other". */
export type ClassroomArea =
  | "natural_sciences"
  | "social_sciences"
  | "arts"
  | "ethics"
  | "physical_education"
  | "religion"
  | "humanities"
  | "mathematics"
  | "technology"
  | "other";

export interface Classroom {
  /** False once its teacher deleted their account (HU-92). */
  has_teacher?: boolean;
  id: string;
  teacher_id: string;
  name: string;
  description: string;
  /** File name of the private logo. Show it with `classroomLogoPath` + `AuthImage`.
   * Without it, the avatar is the initials of the name on `color`. */
  logo_file?: string | null;
  color: ClassroomColor;
  /** See `ClassroomArea`. Required since HU-100, null only in older classes. */
  area?: ClassroomArea | null;
  /** With area "other", which area it is, written by the teacher. */
  area_other?: string | null;
  /** The grade it's for, 1 to 5 (primary school). Same as `area`. */
  grade?: number | null;
  enrollment_code: string;
  created_at: string;
}

/** A classroom in the teacher's own list (`GET /classrooms`). */
export interface TeacherClassroom extends Classroom {
  /** Join requests waiting for the teacher's answer. */
  pending_requests: number;
  /** Students already in the classroom (accepted requests). */
  student_count: number;
}

/** One classroom of a guardian's kid and how its request went, for the
 * parents' portal (`GET /classrooms/family`). The code never comes back. */
export interface FamilyClassroom {
  /** False once its teacher deleted their account (HU-92): the class stays
   * for the kids already in it, but has nobody to write to. */
  has_teacher?: boolean;
  enrollment_id: string;
  student_id: string;
  student_first_name: string;
  /** "pendiente" while the teacher hasn't answered, then "aceptada" or "rechazada". */
  status: EnrollmentStatus;
  requested_at: string;
  /** When the teacher answered, null while it waits. */
  resolved_at: string | null;
  classroom_id: string;
  name: string;
  description: string;
  /** The logo, asked with the portal open (`classroomLogoPath`). */
  logo_file: string | null;
  color: ClassroomColor;
  area: ClassroomArea | null;
  area_other: string | null;
  grade: number | null;
  /** null when the service that knows it didn't answer. */
  teacher_name: string | null;
  published_lessons: number | null;
  /** Units with at least one published lesson, null like the lessons. */
  published_units: number | null;
}

/** The space of a class the kid is in (`GET /classrooms/family/{enrollment_id}`). */
export interface FamilyClassroomDetail extends FamilyClassroom {
  /** null when identity-service didn't answer. */
  teacher: TeacherPublicProfile | null;
}

/** A class found by its code, before asking to join
 * (`POST /classrooms/family/lookup`). */
export interface ClassroomPreview {
  classroom_id: string;
  name: string;
  description: string;
  logo_file: string | null;
  color: ClassroomColor;
  area: ClassroomArea | null;
  area_other: string | null;
  grade: number | null;
  teacher: TeacherPublicProfile | null;
  published_lessons: number | null;
  /** Units with at least one published lesson, null like the lessons. */
  published_units: number | null;
}

export interface ClassroomMember {
  enrollment_id: string;
  student_id: string;
  first_name: string;
  avatar_id: number;
  status: EnrollmentStatus;
  /** Their guardian. null when identity-service doesn't have the kid anymore. */
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
}

export interface ClassroomWithStudents extends Classroom {
  students: ClassroomMember[];
}

export interface EnrollmentRequest {
  enrollment_id: string;
  student_id: string;
  student_first_name: string;
  student_avatar_id: number;
  guardian_name: string;
  guardian_contact: string;
  requested_at: string;
}

/** A group of lessons about the same topic, with the question that guides it (HU-101). */
export interface Unit {
  id: string;
  classroom_id: string;
  title: string;
  guiding_question: string;
  order_index: number;
}

/** `GET /content/teachers/me/content-summary`: what the teacher has built in
 * one classroom. Classrooms with nothing yet don't come in the list. */
export interface ClassroomContentSummary {
  classroom_id: string;
  units: number;
  published_lessons: number;
  draft_lessons: number;
}

/** `GET /content/classrooms/{id}/units`: each unit with its lessons, in order. */
export interface UnitWithLessons extends Unit {
  lessons: Lesson[];
}

export interface Lesson {
  id: string;
  classroom_id: string;
  unit_id: string;
  teacher_id: string;
  title: string;
  /** The sentence the mascot says when the kid opens it (HU-102). */
  purpose: string;
  /** What the kid should be able to do after it, from the DBA (HU-102). */
  learning_goal: string;
  order_index: number;
  status: LessonStatus;
}

interface BlockBase {
  /** Which page of the lesson (or of the extra) it's on, from 0. */
  page_index: number;
  /** Its place inside the page, from 0. */
  order_index: number;
}

/** One block of a page, by type (HU-79). Never HTML: text is shown as text. */
export type BlockFields =
  | { type: "titulo" | "subtitulo" | "texto"; text: string }
  | { type: "lista"; items: string[] }
  /** The first row is the header. */
  | { type: "tabla"; rows: string[][] }
  /** The private image of the lesson, with what it shows (HU-103). */
  | { type: "imagen"; image_file: string; alt_text?: string | null };

/** What the editor sends for a block. */
export type ContentBlockInput = BlockBase & BlockFields;

/** A saved block. */
export type ContentBlock = ContentBlockInput & { id: string };

export interface QuestionOption {
  text: string;
  is_correct: boolean;
}

export interface Question {
  prompt: string;
  /** Two to four, exactly one right to publish. */
  options: QuestionOption[];
}

/** The questions of a lesson or of an extra activity (HU-80). */
export interface Activity {
  /** Right answers it takes to pass. */
  pass_threshold: number;
  questions: Question[];
}

export type ExtraKind = "contenido" | "actividad";

/** More to read or one more activity, for everyone or some kids (HU-82). */
export interface Extra {
  id: string;
  kind: ExtraKind;
  title: string;
  order_index: number;
  for_everyone: boolean;
  student_ids: string[];
  blocks: ContentBlock[];
  activity: Activity | null;
  /** What it still needs; the kids only see it once this is empty. */
  missing: string[];
}

export interface LessonDetail extends Lesson {
  blocks: ContentBlock[];
  /** Only for its teacher: a kid never gets the right answers. */
  activity: Activity | null;
  extras: Extra[];
  /** Only for its teacher: what's still missing to publish it. */
  missing: string[];
}

/* --- A kid playing a lesson (HU-46, HU-47) ---
 * Questions and options carry ids to answer them, never which one is right:
 * the server grades. */

export interface PlayOption {
  id: string;
  text: string;
}

export interface PlayQuestion {
  id: string;
  prompt: string;
  options: PlayOption[];
}

export interface PlayActivity {
  pass_threshold: number;
  questions: PlayQuestion[];
}

/** An extra the kid gets (complete, and for everyone or for them). */
export interface PlayExtra {
  id: string;
  kind: ExtraKind;
  title: string;
  blocks: ContentBlock[];
  activity: PlayActivity | null;
  /** The furthest page they already reached in it (their progress). */
  pages_seen: number;
  /** The page where they left it, from 1 (0 if never opened). */
  last_page: number;
  /** They already did its activity once, whatever the score. */
  activity_done: boolean;
}

/** `GET /content/lessons/{id}/play` */
export interface PlayLesson extends Lesson {
  blocks: ContentBlock[];
  activity: PlayActivity | null;
  extras: PlayExtra[];
  pages_seen: number;
  last_page: number;
  activity_done: boolean;
}

/** `PUT /content/lessons/{id}/progress` */
export interface PageProgress {
  extra_id: string | null;
  pages_seen: number;
  last_page: number;
}

/** `POST /content/lessons/{id}/answer-checks`: right or wrong, never which
 * option was the right one. */
export interface AnswerCheck {
  correct: boolean;
}

/** `POST /content/lessons/{id}/attempts`: the try graded by the server. */
export interface AttemptResult {
  id: string;
  correct: number;
  total: number;
  passed: boolean;
  created_at: string;
  /** Right or wrong, per question in their order. */
  results: boolean[];
}

/* --- A kid's progress in a class, for the parents' portal --- */

export interface ProgressAttempt {
  correct: number;
  total: number;
  passed: boolean;
  created_at: string;
}

/** The lesson itself ("leccion") or one of its extras. */
export interface PartProgress {
  extra_id: string | null;
  title: string;
  kind: "leccion" | ExtraKind;
  total_pages: number;
  pages_seen: number;
  has_activity: boolean;
  /** Oldest first. */
  attempts: ProgressAttempt[];
  /** 0 to 100: every page counts one step, the activity one more once tried. */
  percent: number;
}

/** `GET /classrooms/family/{enrollment_id}/progress`, one per published lesson in order. */
export interface LessonProgress {
  lesson_id: string;
  title: string;
  unit_title: string;
  main: PartProgress;
  extras: PartProgress[];
}

/* --- The statistics of a class for its teacher (HU-86, HU-87) --- */

export interface KidInLesson {
  student_id: string;
  first_name: string;
  avatar_id: number;
  /** 0 to 100, the same percent their family sees. */
  percent: number;
  tries: number;
  /** Their best try, or null if they haven't tried. */
  best_correct: number | null;
  best_total: number | null;
  passed: boolean;
}

export interface LessonStatistics {
  lesson_id: string;
  title: string;
  unit_title: string;
  has_activity: boolean;
  average_percent: number;
  completed: number;
  in_progress: number;
  not_started: number;
  passed: number;
  tried_not_passed: number;
  /** Best performance first; the ones who haven't tried go last. */
  kids: KidInLesson[];
}

export interface KidInClass {
  student_id: string;
  first_name: string;
  avatar_id: number;
  average_percent: number;
  completed_lessons: number;
}

/** `GET /classrooms/{id}/statistics`. Only the lessons themselves count, not their extras. */
export interface ClassStatistics {
  kids: number;
  lessons: LessonStatistics[];
  /** Of every kid and lesson, the percent that got to 100 %. */
  completed_percent: number;
  average_percent: number;
  by_kid: KidInClass[];
}

interface NotificationBase {
  id: string;
  classroom_id: string;
  enrollment_id: string;
  /** The kid it's about, the name of the classroom and who it's from. They
   * can be missing in old notifications or if a service didn't answer. */
  student_id: string | null;
  student_name: string | null;
  classroom_name: string | null;
  sender_name: string | null;
  read: boolean;
  created_at: string;
  /** The conversation a message belongs to (HU-51). Only in messages. */
  thread_id?: string | null;
}

export type NotificationItem =
  | (NotificationBase & { event: "request.created" })
  | (NotificationBase & { event: "request.resolved"; decision: "aceptada" | "rechazada" })
  /** The teacher took the kid out of the classroom. Only the guardian gets it. */
  | (NotificationBase & { event: "enrollment.removed" })
  /** The teacher left IRIS and a request still waiting was closed (HU-92). */
  | (NotificationBase & { event: "request.closed" })
  /** What a family does from the portal (EP-07). Only the teacher gets them. */
  | (NotificationBase & { event: "request.cancelled" | "enrollment.withdrawn" })
  /** A guardian's message to the teacher of the class (HU-48). */
  | (NotificationBase & {
      event: "message.sent";
      subject: string | null;
      body: string | null;
      /** "teacher" in the copy the guardian keeps of what they wrote (HU-51). */
      addressee?: "teacher" | null;
    })
  /** The teacher's message to a kid or to their guardian (HU-77). The teacher
   * keeps a copy, already read, with `addressee` saying to whom it went. */
  | (NotificationBase & {
      event: "teacher.message";
      subject: string | null;
      body: string | null;
      addressee: MessageRecipient | null;
    })
  /** A new lesson, or a new extra of a published one, for the kid and their
   * guardian (HU-83). */
  | (NotificationBase & {
      event: "lesson.published" | "extra.published";
      lesson_id: string | null;
      lesson_title: string | null;
      extra_title: string | null;
    })
  /** What a kid finished, for their teacher (HU-69): the reading, or the first
   * try at the activity with its score. */
  | (NotificationBase & {
      event: "lesson.content_completed" | "lesson.activity_completed";
      lesson_id: string | null;
      lesson_title: string | null;
      correct: number | null;
      total: number | null;
    });

/** Who a teacher writes to about a kid of the class (HU-77). */
export type MessageRecipient = "student" | "guardian";

/** One page of the tray, newest first. */
export interface NotificationPage {
  items: NotificationItem[];
  total: number;
  unread_count: number;
  page: number;
  page_size: number;
}
