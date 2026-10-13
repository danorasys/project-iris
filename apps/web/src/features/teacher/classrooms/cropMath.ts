// The math of ImageCropper, apart so it can be tested without a canvas:
// how big the picture is drawn, how far it can move and how it zooms.

/** Side of the logo's frame inside the stage, in stage pixels. */
export const FRAME = 216;
export const MAX_ZOOM = 4;

export type Rotation = 0 | 90 | 180 | 270;

export interface View {
  zoom: number;
  /** Where the picture's center is, from the frame's center, in stage pixels. */
  x: number;
  y: number;
  rotation: Rotation;
  flipped: boolean;
}

/** Centered, straight and without zoom, how a new picture starts. */
export const START: View = { zoom: 1, x: 0, y: 0, rotation: 0, flipped: false };

// Nothing changed yet, so there's nothing to start over.
export function isStart(view: View): boolean {
  return view.zoom === 1 && view.x === 0 && view.y === 0 && view.rotation === 0 && !view.flipped;
}

/** Only the size of the picture matters here (an HTMLImageElement has it). */
export interface PictureSize {
  naturalWidth: number;
  naturalHeight: number;
}

// Width and height of the picture once it's turned.
export function turnedSize(img: PictureSize, rotation: Rotation) {
  const sideways = rotation % 180 !== 0;
  return {
    width: sideways ? img.naturalHeight : img.naturalWidth,
    height: sideways ? img.naturalWidth : img.naturalHeight,
  };
}

// At zoom 1 the picture just covers the frame, never less.
export function scaleFor(img: PictureSize, view: View): number {
  const { width, height } = turnedSize(img, view.rotation);
  return Math.max(FRAME / width, FRAME / height) * view.zoom;
}

// Keeps the frame always covered: no empty borders in the logo.
export function clamp(view: View, img: PictureSize): View {
  const { width, height } = turnedSize(img, view.rotation);
  const scale = scaleFor(img, view);
  const maxX = Math.max(0, (width * scale - FRAME) / 2);
  const maxY = Math.max(0, (height * scale - FRAME) / 2);
  return { ...view, x: Math.min(maxX, Math.max(-maxX, view.x)), y: Math.min(maxY, Math.max(-maxY, view.y)) };
}

// A new zoom (between 1 and MAX_ZOOM) that keeps still the point under
// `anchor` (from the frame's center), so it zooms towards the pointer.
export function zoomAround(view: View, zoom: number, img: PictureSize, anchor = { x: 0, y: 0 }): View {
  const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const factor = next / view.zoom;
  return clamp(
    {
      ...view,
      zoom: next,
      x: anchor.x - (anchor.x - view.x) * factor,
      y: anchor.y - (anchor.y - view.y) * factor,
    },
    img,
  );
}
