import { describe, expect, it } from "vitest";
import type { ContentBlock } from "@iris/shared-types";
import { emptyBlock, move, newQuestion, toActivity, toBlocks, toEditorActivity, toPages } from "./editorModel";

const saved: ContentBlock[] = [
  { id: "c", type: "texto", text: "Segunda página", page_index: 1, order_index: 0 },
  { id: "b", type: "lista", items: ["Perro"], page_index: 0, order_index: 1 },
  { id: "a", type: "titulo", text: "Los animales", page_index: 0, order_index: 0 },
];

describe("editorModel", () => {
  it("groups the saved blocks in their pages and gives them back in order", () => {
    const pages = toPages(saved);

    expect(pages.map((page) => page.blocks.map((block) => block.type))).toEqual([["titulo", "lista"], ["texto"]]);
    // The local keys never reach the server, and the places are counted again.
    expect(toBlocks(pages)).toEqual([
      { type: "titulo", text: "Los animales", page_index: 0, order_index: 0 },
      { type: "lista", items: ["Perro"], page_index: 0, order_index: 1 },
      { type: "texto", text: "Segunda página", page_index: 1, order_index: 0 },
    ]);
  });

  it("renumbers the pages after moving one", () => {
    const pages = move(toPages(saved), 1, -1);

    expect(toBlocks(pages).map((block) => [block.type, block.page_index, block.order_index])).toEqual([
      ["texto", 0, 0],
      ["titulo", 1, 0],
      ["lista", 1, 1],
    ]);
  });

  it("starts each kind of block empty but with its shape", () => {
    expect(emptyBlock("lista")).toMatchObject({ type: "lista", items: [""] });
    expect(emptyBlock("tabla")).toMatchObject({
      type: "tabla",
      rows: [
        ["", ""],
        ["", ""],
      ],
    });
    expect(emptyBlock("subtitulo")).toMatchObject({ type: "subtitulo", text: "" });
  });

  it("never sends a pass threshold over the number of questions", () => {
    const activity = { pass_threshold: 5, questions: [newQuestion(), newQuestion()] };

    expect(toActivity(activity).pass_threshold).toBe(2);
    expect(toActivity(activity).questions[0].options).toEqual([
      { text: "", is_correct: false },
      { text: "", is_correct: false },
    ]);
  });

  it("a lesson without activity starts with one empty question", () => {
    expect(toEditorActivity(null).questions).toHaveLength(1);
    expect(toEditorActivity(null).pass_threshold).toBe(1);
  });
});
