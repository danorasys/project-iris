import type { CSSProperties } from "react";

// Gives a part its place in an entrance: the CSS of motion.module.css waits
// --i turns before bringing it in, so a group never shows up all at once.
export const turn = (i: number) => ({ "--i": i }) as CSSProperties;
