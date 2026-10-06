import type { ContentBlockInput } from "@iris/shared-types";
import { lessonImagePath } from "@/shared/api/mediaPaths";
import { AuthImage } from "@/shared/ui/AuthImage";
import styles from "./BlockView.module.css";

interface BlockViewProps {
  block: ContentBlockInput;
  /** The lesson whose private folder the image is in. */
  lessonId: string;
  /** Bigger letters for the kids' viewer. */
  large?: boolean;
}

/** One block of a page, read only: the same look in the teacher's preview
 * and in the kids' viewer. Text is always shown as text, never as HTML. */
export function BlockView({ block, lessonId, large = false }: BlockViewProps) {
  const size = large ? styles.large : "";
  switch (block.type) {
    case "titulo":
      return <h2 className={`${styles.title} ${size}`}>{block.text}</h2>;
    case "subtitulo":
      return <h3 className={`${styles.subtitle} ${size}`}>{block.text}</h3>;
    case "texto":
      return <p className={`${styles.paragraph} ${size}`}>{block.text}</p>;
    case "lista":
      return (
        <ul className={`${styles.list} ${size}`}>
          {block.items.map((item, index) => (
            // Items and cells are plain strings that can repeat, their position is their key.
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    case "tabla": {
      const [header = [], ...rows] = block.rows;
      return (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${size}`}>
            <thead>
              <tr>
                {header.map((cell, index) => (
                  <th key={index} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "imagen":
      return (
        <figure className={styles.figure}>
          <AuthImage
            path={lessonImagePath(lessonId, block.image_file)}
            alt={block.alt_text ?? ""}
            className={styles.image}
          />
        </figure>
      );
  }
}
