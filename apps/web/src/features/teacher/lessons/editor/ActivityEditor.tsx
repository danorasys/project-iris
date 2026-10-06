import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@/shared/ui/icons";
import { LIMITS } from "../lessonLimits";
import {
  move,
  newKey,
  newQuestion,
  removeAt,
  replaceAt,
  type EditorActivity,
  type EditorQuestion,
} from "./editorModel";
import styles from "./Editor.module.css";

interface ActivityEditorProps {
  activity: EditorActivity;
  onChange: (activity: EditorActivity) => void;
  /** A short id for the radio groups, so two editors on a page don't mix. */
  name: string;
}

/** The questions of an activity (HU-80): each with its statement and two
 * to four options, exactly one right, and how many right answers it takes
 * to pass. The kid answers them one at a time (HU-63). */
export function ActivityEditor({ activity, onChange, name }: ActivityEditorProps) {
  const { questions } = activity;
  const setQuestions = (next: EditorQuestion[]) =>
    onChange({
      ...activity,
      questions: next,
      pass_threshold: Math.min(activity.pass_threshold, Math.max(next.length, 1)),
    });
  const setQuestion = (index: number, question: EditorQuestion) => setQuestions(replaceAt(questions, index, question));

  return (
    <div className={styles.stack}>
      <p className={styles.hint}>
        Entre 3 y 8 preguntas funcionan bien. El peque responde una a la vez, en un orden distinto en cada intento.
      </p>

      <label className={styles.threshold}>
        Para aprobar se necesitan
        <select
          className={styles.select}
          value={Math.min(activity.pass_threshold, Math.max(questions.length, 1))}
          onChange={(event) => onChange({ ...activity, pass_threshold: Number(event.target.value) })}
        >
          {Array.from({ length: Math.max(questions.length, 1) }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
        de {questions.length} {questions.length === 1 ? "respuesta correcta" : "respuestas correctas"}
      </label>

      <ol className={styles.list}>
        {questions.map((question, index) => {
          const hasRight = question.options.some((option) => option.is_correct);
          return (
            <li key={question.key} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.number} aria-hidden="true">
                  {index + 1}
                </span>
                <h3 className={styles.cardTitle}>Pregunta {index + 1}</h3>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => setQuestions(move(questions, index, -1))}
                    disabled={index === 0}
                    aria-label={`Subir la pregunta ${index + 1}`}
                  >
                    <IconArrowUp width={16} height={16} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => setQuestions(move(questions, index, 1))}
                    disabled={index === questions.length - 1}
                    aria-label={`Bajar la pregunta ${index + 1}`}
                  >
                    <IconArrowDown width={16} height={16} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.danger}`}
                    onClick={() => setQuestions(removeAt(questions, index))}
                    aria-label={`Quitar la pregunta ${index + 1}`}
                  >
                    <IconTrash width={16} height={16} />
                  </button>
                </div>
              </div>

              <textarea
                className={`${styles.textarea} ${question.prompt.trim() ? "" : styles.inputMissing}`}
                value={question.prompt}
                maxLength={LIMITS.question}
                rows={2}
                onChange={(event) => setQuestion(index, { ...question, prompt: event.target.value })}
                aria-label={`Enunciado de la pregunta ${index + 1}`}
                placeholder="Escribe la pregunta"
              />

              <fieldset className={styles.optionGroup}>
                <legend className={styles.hint}>Opciones, marca la correcta:</legend>
                {question.options.map((option, optionIndex) => (
                  <div key={option.key} className={styles.option}>
                    <label className={styles.correct}>
                      <input
                        type="radio"
                        name={`${name}-q${question.key}`}
                        checked={option.is_correct}
                        onChange={() =>
                          setQuestion(index, {
                            ...question,
                            options: question.options.map((item, position) => ({
                              ...item,
                              is_correct: position === optionIndex,
                            })),
                          })
                        }
                      />
                      Correcta
                    </label>
                    <input
                      className={`${styles.input} ${option.text.trim() ? "" : styles.inputMissing}`}
                      value={option.text}
                      maxLength={LIMITS.option}
                      onChange={(event) =>
                        setQuestion(index, {
                          ...question,
                          options: replaceAt(question.options, optionIndex, { ...option, text: event.target.value }),
                        })
                      }
                      aria-label={`Opción ${optionIndex + 1} de la pregunta ${index + 1}`}
                      placeholder={`Opción ${optionIndex + 1}`}
                    />
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.danger}`}
                      onClick={() =>
                        setQuestion(index, { ...question, options: removeAt(question.options, optionIndex) })
                      }
                      disabled={question.options.length <= LIMITS.optionsMin}
                      aria-label={`Quitar la opción ${optionIndex + 1} de la pregunta ${index + 1}`}
                    >
                      <IconTrash width={16} height={16} />
                    </button>
                  </div>
                ))}
              </fieldset>
              {!hasRight && <p className={styles.missing}>Marca cuál es la opción correcta.</p>}
              <button
                type="button"
                className={styles.small}
                onClick={() =>
                  setQuestion(index, {
                    ...question,
                    options: [...question.options, { key: newKey(), text: "", is_correct: false }],
                  })
                }
                disabled={question.options.length >= LIMITS.optionsMax}
              >
                <IconPlus width={14} height={14} /> Agregar opción
              </button>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        className={styles.addBig}
        onClick={() => setQuestions([...questions, newQuestion()])}
        disabled={questions.length >= LIMITS.questions}
      >
        <IconPlus width={18} height={18} />
        Agregar pregunta
      </button>
    </div>
  );
}
