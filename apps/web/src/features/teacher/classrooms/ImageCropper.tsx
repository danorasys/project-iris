import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { IconFlip, IconMinus, IconPlus, IconRotateLeft, IconRotateRight, IconUndo } from "@/shared/ui/icons";
import { clamp, FRAME, isStart, MAX_ZOOM, scaleFor, START, zoomAround, type Rotation, type View } from "./cropMath";
import styles from "./ImageCropper.module.css";

// The stage the teacher works on, the rounded corner of the logo's frame
// (the same as the avatar) and the size of the image uploaded.
const STAGE = 300;
const FRAME_RADIUS = 0.24;
const OUTPUT = 512;
const ZOOM_STEP = 0.1;
const KEY_STEP = 8;
// The crop to upload is made once the teacher stops for a moment, not on
// every pixel of a drag.
const OUTPUT_DELAY = 150;

interface ImageCropperProps {
  /** The picture the teacher picked, already checked to be an image. */
  file: File;
  /** Gets the square crop as a PNG every time it changes. */
  onChange: (crop: Blob) => void;
}

// Draws the picture as the view says, with the frame of `frameSize` pixels
// centered at (cx, cy). The same drawing makes the stage and the upload.
function paintPicture(
  context: CanvasRenderingContext2D,
  img: HTMLImageElement,
  view: View,
  frameSize: number,
  cx: number,
  cy: number,
) {
  const ratio = frameSize / FRAME;
  const scale = scaleFor(img, view) * ratio;
  context.save();
  context.translate(cx + view.x * ratio, cy + view.y * ratio);
  if (view.flipped) context.scale(-1, 1);
  context.rotate((view.rotation * Math.PI) / 180);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    img,
    (-img.naturalWidth * scale) / 2,
    (-img.naturalHeight * scale) / 2,
    img.naturalWidth * scale,
    img.naturalHeight * scale,
  );
  context.restore();
}

// Where a pointer is, from the frame's center, in stage pixels.
function pointFromCenter(canvas: HTMLCanvasElement | null, clientX: number, clientY: number) {
  const box = canvas?.getBoundingClientRect();
  if (!box || box.width === 0) return { x: 0, y: 0 };
  const ratio = STAGE / box.width;
  return { x: (clientX - box.left) * ratio - STAGE / 2, y: (clientY - box.top) * ratio - STAGE / 2 };
}

function roundedSquare(context: CanvasRenderingContext2D, x: number, y: number, size: number, radius: number) {
  context.moveTo(x + radius, y);
  context.arcTo(x + size, y, x + size, y + size, radius);
  context.arcTo(x + size, y + size, x, y + size, radius);
  context.arcTo(x, y + size, x, y, radius);
  context.arcTo(x, y, x + size, y, radius);
  context.closePath();
}

/** Lets the teacher fit their picture in the classroom's avatar, like the
 * editors of a profile picture: the frame shows what stays, the rest is
 * shaded. Drag to move it, zoom with the wheel, two fingers or the slider
 * (towards where the pointer is), turn it, mirror it or start over. The
 * arrow keys move it and + / - zoom. The picture always covers the frame,
 * and the crop is made in the browser: the server only gets the result. */
export function ImageCropper({ file, onChange }: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hintId = useId();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [view, setView] = useState<View>(START);
  // The thirds grid shows while the picture moves.
  const [active, setActive] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  // What the drag or the pinch started from: the view, where the finger
  // was (drag) or the distance and middle of both fingers (pinch).
  const gesture = useRef<{ view: View; from: { x: number; y: number }; distance: number } | null>(null);
  const quiet = useRef<number | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // The picture is read from a temporary URL, freed when it changes. A new
  // picture starts centered, straight and without zoom.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setView(START);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The stage: the picture, the shade around the frame, the frame and, while
  // moving, the thirds. Drawn at the screen's density, so it looks sharp.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !image) return;
    const density = window.devicePixelRatio || 1;
    canvas.width = STAGE * density;
    canvas.height = STAGE * density;
    context.setTransform(density, 0, 0, density, 0, 0);
    context.clearRect(0, 0, STAGE, STAGE);
    paintPicture(context, image, view, FRAME, STAGE / 2, STAGE / 2);

    const start = (STAGE - FRAME) / 2;
    const radius = FRAME * FRAME_RADIUS;
    // The shade takes the deep blue of IRIS from the stylesheet.
    context.fillStyle = getComputedStyle(canvas).color;
    context.globalAlpha = 0.55;
    context.beginPath();
    context.rect(0, 0, STAGE, STAGE);
    roundedSquare(context, start, start, FRAME, radius);
    context.fill("evenodd");
    context.globalAlpha = 1;

    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.beginPath();
    roundedSquare(context, start, start, FRAME, radius);
    context.stroke();

    if (active) {
      context.save();
      context.beginPath();
      roundedSquare(context, start, start, FRAME, radius);
      context.clip();
      context.globalAlpha = 0.5;
      context.lineWidth = 1;
      context.beginPath();
      for (const third of [1, 2]) {
        const at = start + (FRAME * third) / 3;
        context.moveTo(at, start);
        context.lineTo(at, start + FRAME);
        context.moveTo(start, at);
        context.lineTo(start + FRAME, at);
      }
      context.stroke();
      context.restore();
    }
  }, [image, view, active]);

  // The crop to upload, once the teacher stops for a moment.
  useEffect(() => {
    if (!image) return;
    const timer = window.setTimeout(() => {
      const output = document.createElement("canvas");
      output.width = OUTPUT;
      output.height = OUTPUT;
      const context = output.getContext("2d");
      if (!context) return;
      paintPicture(context, image, view, OUTPUT, OUTPUT / 2, OUTPUT / 2);
      output.toBlob((blob) => {
        if (blob) onChangeRef.current(blob);
      }, "image/png");
    }, OUTPUT_DELAY);
    return () => window.clearTimeout(timer);
  }, [image, view]);

  useEffect(() => () => window.clearTimeout(quiet.current), []);

  // Shows the thirds for a moment after a zoom or a key.
  const flash = useCallback(() => {
    setActive(true);
    window.clearTimeout(quiet.current);
    quiet.current = window.setTimeout(() => setActive(false), 600);
  }, []);

  const zoomTo = useCallback(
    (from: View, zoom: number, anchor?: { x: number; y: number }): View | null =>
      image ? zoomAround(from, zoom, image, anchor) : null,
    [image],
  );

  // The wheel zooms the picture instead of scrolling the form. React's
  // onWheel can't stop the scroll (its listener is passive), so it's added
  // here by hand.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    function zoomWithWheel(event: globalThis.WheelEvent) {
      event.preventDefault();
      const anchor = pointFromCenter(canvas, event.clientX, event.clientY);
      const factor = Math.exp(-event.deltaY * 0.0015);
      setView((current) => zoomTo(current, current.zoom * factor, anchor) ?? current);
      flash();
    }
    canvas.addEventListener("wheel", zoomWithWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", zoomWithWheel);
  }, [image, zoomTo, flash]);

  function change(next: View | null) {
    if (next) setView(next);
  }

  function fromCenter(clientX: number, clientY: number) {
    return pointFromCenter(canvasRef.current, clientX, clientY);
  }

  // One finger or the mouse drags; a second finger starts the pinch.
  function startPointer(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setActive(true);
    startGesture();
  }

  function startGesture() {
    const points = [...pointers.current.values()];
    const [a, b] = points;
    if (!a) return;
    gesture.current = b
      ? { view, from: fromCenter((a.x + b.x) / 2, (a.y + b.y) / 2), distance: Math.hypot(a.x - b.x, a.y - b.y) }
      : { view, from: { x: a.x, y: a.y }, distance: 0 };
  }

  function movePointer(event: PointerEvent<HTMLCanvasElement>) {
    if (!image || !pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const [a, b] = [...pointers.current.values()];
    const start = gesture.current;
    const box = canvasRef.current?.getBoundingClientRect();
    const ratio = box ? STAGE / box.width : 1;
    if (a && b && start.distance > 0) {
      change(zoomTo(start.view, start.view.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / start.distance), start.from));
    } else if (a) {
      change(
        clamp(
          { ...start.view, x: start.view.x + (a.x - start.from.x) * ratio, y: start.view.y + (a.y - start.from.y) * ratio },
          image,
        ),
      );
    }
  }

  function endPointer(event: PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      setActive(false);
    } else {
      // From two fingers to one: it goes on dragging from here.
      startGesture();
    }
  }

  function moveWithKeys(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!image) return;
    const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const moves: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      change(clamp({ ...view, x: view.x + move.x, y: view.y + move.y }, image));
      flash();
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      change(zoomTo(view, view.zoom + ZOOM_STEP));
      flash();
    } else if (event.key === "-") {
      event.preventDefault();
      change(zoomTo(view, view.zoom - ZOOM_STEP));
      flash();
    }
  }

  function turn(by: 90 | -90) {
    if (!image) return;
    const rotation = (((view.rotation + by) % 360) + 360) % 360;
    change(clamp({ ...view, rotation: rotation as Rotation }, image));
  }

  const disabled = !image;
  const percent = Math.round(view.zoom * 100);

  return (
    <div className={styles.cropper}>
      <canvas
        ref={canvasRef}
        width={STAGE}
        height={STAGE}
        className={styles.stage}
        tabIndex={0}
        role="img"
        aria-label="Encuadre del logo de la clase"
        aria-describedby={hintId}
        onPointerDown={startPointer}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onKeyDown={moveWithKeys}
      />

      <div className={styles.toolbar}>
        <div className={styles.zoom}>
          <button
            type="button"
            className={styles.tool}
            onClick={() => change(zoomTo(view, view.zoom - ZOOM_STEP))}
            disabled={disabled || view.zoom <= 1}
            aria-label="Alejar"
            title="Alejar"
          >
            <IconMinus width={18} height={18} />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            onChange={(event) => change(zoomTo(view, Number(event.target.value)))}
            disabled={disabled}
            aria-label="Acercar la imagen"
            aria-valuetext={`${percent} %`}
          />
          <button
            type="button"
            className={styles.tool}
            onClick={() => change(zoomTo(view, view.zoom + ZOOM_STEP))}
            disabled={disabled || view.zoom >= MAX_ZOOM}
            aria-label="Acercar"
            title="Acercar"
          >
            <IconPlus width={18} height={18} />
          </button>
          <span className={styles.percent} aria-hidden="true">
            {percent} %
          </span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.tool}
            onClick={() => turn(-90)}
            disabled={disabled}
            aria-label="Girar a la izquierda"
            title="Girar a la izquierda"
          >
            <IconRotateLeft width={18} height={18} />
          </button>
          <button
            type="button"
            className={styles.tool}
            onClick={() => turn(90)}
            disabled={disabled}
            aria-label="Girar a la derecha"
            title="Girar a la derecha"
          >
            <IconRotateRight width={18} height={18} />
          </button>
          <button
            type="button"
            className={styles.tool}
            onClick={() => change({ ...view, flipped: !view.flipped })}
            disabled={disabled}
            aria-label="Voltear como en un espejo"
            aria-pressed={view.flipped}
            title="Voltear"
          >
            <IconFlip width={18} height={18} />
          </button>
          <button
            type="button"
            className={styles.reset}
            onClick={() => change(START)}
            disabled={disabled || isStart(view)}
          >
            <IconUndo width={16} height={16} />
            Restablecer
          </button>
        </div>
      </div>

      <p id={hintId} className={styles.hint}>
        Arrastra la imagen para moverla y acércala con la rueda del mouse, con dos dedos o con el control. Con el
        teclado: las flechas la mueven y + o - la acercan.
      </p>
    </div>
  );
}
