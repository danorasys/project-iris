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

export type BlockType = "texto" | "imagen";

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

/** What a teacher tells the families about themselves. Everything is
 * optional, and it never has contact or ID data. */
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

export interface TeacherProfile {
  about: string | null;
  studies: TeacherStudy[];
  experiences: TeacherExperience[];
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

export interface UpdateStudentAvatarRequest {
  avatar_id: number;
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

export interface Classroom {
  id: string;
  teacher_id: string;
  name: string;
  description: string;
  /** File name of the private logo. Show it with `classroomLogoPath` + `AuthImage`.
   * Without it, the avatar is the initials of the name on `color`. */
  logo_file?: string | null;
  color: ClassroomColor;
  enrollment_code: string;
  created_at: string;
}

/** A classroom in the teacher's own list (`GET /classrooms`). */
export interface TeacherClassroom extends Classroom {
  /** Join requests waiting for the teacher's answer. */
  pending_requests: number;
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

export interface Lesson {
  id: string;
  classroom_id: string;
  teacher_id: string;
  title: string;
  order_index: number;
  status: LessonStatus;
}

export interface ContentBlock {
  id: string;
  lesson_id: string;
  type: BlockType;
  content?: string | null;
  /** File name of the private image. Show it with `lessonImagePath` + `AuthImage`. */
  image_file?: string | null;
  order_index: number;
}

export interface LessonDetail extends Lesson {
  blocks: ContentBlock[];
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
}

export type NotificationItem =
  | (NotificationBase & { event: "request.created" })
  | (NotificationBase & { event: "request.resolved"; decision: "aceptada" | "rechazada" })
  /** The teacher took the kid out of the classroom. Only the guardian gets it. */
  | (NotificationBase & { event: "enrollment.removed" });

/** One page of the tray, newest first. */
export interface NotificationPage {
  items: NotificationItem[];
  total: number;
  unread_count: number;
  page: number;
  page_size: number;
}
