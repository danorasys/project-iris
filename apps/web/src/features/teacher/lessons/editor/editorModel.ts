import type { Activity, BlockType, ContentBlock, ContentBlockInput } from "@iris/shared-types";

// The editor keeps its own copy of the pages and questions, with a local
// key on each piece for React (and for moving them around). The keys never
// reach the server: toBlocks/toActivity drop them.

let counter = 0;
export function newKey(): string {
  counter += 1;
  return `k${counter}`;
}

export type EditorBlock = ContentBlockInput & { key: string };

export interface EditorPage {
  key: string;
  blocks: EditorBlock[];
}

export interface EditorOption {
  key: string;
  text: string;
  is_correct: boolean;
}

export interface EditorQuestion {
  key: string;
  prompt: string;
  options: EditorOption[];
}

export interface EditorActivity {
  pass_threshold: number;
  questions: EditorQuestion[];
}

/** The saved blocks grouped in their pages, in order. */
export function toPages(blocks: ContentBlock[]): EditorPage[] {
  const pages = new Map<number, EditorBlock[]>();
  for (const block of [...blocks].sort((a, b) => a.page_index - b.page_index || a.order_index - b.order_index)) {
    // The server id stays behind: the editor tells blocks apart by its own keys.
    const { id, ...rest } = block;
    pages.set(block.page_index, [...(pages.get(block.page_index) ?? []), { ...rest, key: newKey() }]);
  }
  return [...pages.values()].map((pageBlocks) => ({ key: newKey(), blocks: pageBlocks }));
}

/** The pages as the API takes them: each block with its page and its place. */
export function toBlocks(pages: EditorPage[]): ContentBlockInput[] {
  return pages.flatMap((page, pageIndex) =>
    page.blocks.map(({ key: _key, ...block }, orderIndex) => ({
      ...block,
      page_index: pageIndex,
      order_index: orderIndex,
    })),
  );
}

/** A new empty block of a type, for the "add" buttons. */
export function emptyBlock(type: Exclude<BlockType, "imagen">): EditorBlock {
  const base = { key: newKey(), page_index: 0, order_index: 0 };
  switch (type) {
    case "lista":
      return { ...base, type, items: [""] };
    case "tabla":
      return {
        ...base,
        type,
        rows: [
          ["", ""],
          ["", ""],
        ],
      };
    default:
      return { ...base, type, text: "" };
  }
}

export function emptyPage(): EditorPage {
  return { key: newKey(), blocks: [emptyBlock("titulo"), emptyBlock("texto")] };
}

export function newQuestion(): EditorQuestion {
  return {
    key: newKey(),
    prompt: "",
    options: [
      { key: newKey(), text: "", is_correct: false },
      { key: newKey(), text: "", is_correct: false },
    ],
  };
}

export function toEditorActivity(activity: Activity | null): EditorActivity {
  if (!activity) return { pass_threshold: 1, questions: [newQuestion()] };
  return {
    pass_threshold: activity.pass_threshold,
    questions: activity.questions.map((question) => ({
      key: newKey(),
      prompt: question.prompt,
      options: question.options.map((option) => ({ key: newKey(), ...option })),
    })),
  };
}

/** The activity as the API takes it. The threshold never goes over the
 * number of questions, publishing would refuse it anyway. */
export function toActivity(activity: EditorActivity): Activity {
  return {
    pass_threshold: Math.max(1, Math.min(activity.pass_threshold, activity.questions.length || 1)),
    questions: activity.questions.map((question) => ({
      prompt: question.prompt,
      options: question.options.map(({ key: _key, ...option }) => option),
    })),
  };
}

/** The same list with the item at index moved one place up (-1) or down (+1). */
export function move<T>(items: T[], index: number, step: -1 | 1): T[] {
  const target = index + step;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/** The same list with the item at index replaced. */
export function replaceAt<T>(items: T[], index: number, item: T): T[] {
  return items.map((current, position) => (position === index ? item : current));
}

/** The same list without the item at index. */
export function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_, position) => position !== index);
}
