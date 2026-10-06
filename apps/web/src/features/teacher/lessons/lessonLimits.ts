/** Limits of what a teacher can write in a unit or a lesson. Same numbers as
 * content-service (app/application/lesson_rules.py), which checks them again. */
export const LIMITS = {
  unitTitle: 120,
  guidingQuestion: 300,
  lessonTitle: 200,
  purpose: 200,
  learningGoal: 300,
  heading: 200,
  paragraph: 5000,
  listItems: 20,
  listItem: 300,
  tableRows: 10,
  tableColumns: 6,
  tableCell: 200,
  altText: 200,
  pages: 30,
  blocksPerPage: 15,
  questions: 20,
  question: 300,
  optionsMin: 2,
  optionsMax: 4,
  option: 150,
  extraTitle: 120,
  extras: 10,
} as const;

// Biggest picture a lesson takes, the same as content-service. Checked here
// first, so a heavy file is never sent just to be turned down.
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
