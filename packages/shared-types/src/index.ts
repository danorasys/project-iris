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

export interface TokensAuth {
  access_token: string;
  refresh_token: string;
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
    avatar: string;
    pin: string;
    pin_confirmation: string;
    support_condition?: string;
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
  institution: string;
  document_type_id: number;
  document_number: string;
  date_of_birth: string; // ISO date
  phone: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface StudentProfileLoginRequest {
  student_id: string;
  pin: string;
}

export interface StudentProfile {
  id: string;
  first_name: string;
  avatar: string;
  date_of_birth: string;
  support_condition?: string | null;
}

export interface UpdateStudentAvatarRequest {
  avatar: string;
}

export interface Classroom {
  id: string;
  teacher_id: string;
  name: string;
  description: string;
  logo_url?: string | null;
  enrollment_code: string;
  created_at: string;
}

export interface ClassroomWithStudents extends Classroom {
  students: Array<{
    enrollment_id: string;
    student_id: string;
    first_name: string;
    avatar: string;
    status: EnrollmentStatus;
  }>;
}

export interface EnrollmentRequest {
  enrollment_id: string;
  student_id: string;
  student_first_name: string;
  student_avatar: string;
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
  image_url?: string | null;
  order_index: number;
}

export interface LessonDetail extends Lesson {
  blocks: ContentBlock[];
}

interface NotificationBase {
  id: string;
  classroom_id: string;
  enrollment_id: string;
  read: boolean;
  created_at: string;
}

export type NotificationItem =
  | (NotificationBase & { event: "request.created"; student_name: string })
  | (NotificationBase & { event: "request.resolved"; decision: "aceptada" | "rechazada" });
