import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./ImageCropper.module.css";

/** Side of the square the teacher sees, and of the image that gets uploaded. */
const VIEW_SIZE = 240;
const OUTPUT_SIZE = 512;
const MAX_ZOOM = 3;
const KEY_STEP = 10;

interface ImageCropperProps {
  /** The picture the teacher picked, already checked to be an image. */
  file: File;
  /** Gets the square crop as a PNG every time it changes. */
  onChange: (crop: Blob) => void;
}

interface Offset {
  x: number;
  y: number;
}

/** Lets the teacher fit their picture in the classroom's square avatar:
 * drag it (or use the arrow keys) to move it and the slider to zoom. The
 * picture always covers the whole square, there are never empty borders.
 * The crop is made in the browser, the server only gets the result. */
export function ImageCropper({ file, onChange }: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const drag = useRef<{ pointer: number; from: Offset; start: Offset } | null>(null);
  // The latest callback, without making every new one redraw the crop.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // The picture is read from a temporary URL, freed when it changes.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // How big the picture is drawn: at zoom 1 it just covers the square.
  const scaleFor = useCallback(
    (img: HTMLImageElement, z: number) => Math.max(VIEW_SIZE / img.naturalWidth, VIEW_SIZE / img.naturalHeight) * z,
    [],
  );

  // Keeps the picture covering the square while it moves or zooms out.
  const clamp = useCallback(
    (next: Offset, img: HTMLImageElement, z: number): Offset => {
      const scale = scaleFor(img, z);
      const maxX = Math.max(0, (img.naturalWidth * scale - VIEW_SIZE) / 2);
      const maxY = Math.max(0, (img.naturalHeight * scale - VIEW_SIZE) / 2);
      return { x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
    },
    [scaleFor],
  );

  const draw = useCallback(
    (canvas: HTMLCanvasElement, size: number, img: HTMLImageElement, z: number, at: Offset) => {
      const context = canvas.getContext("2d");
      if (!context) return;
      const ratio = size / VIEW_SIZE;
      const scale = scaleFor(img, z) * ratio;
      const width = img.naturalWidth * scale;
      const height = img.naturalHeight * scale;
      context.clearRect(0, 0, size, size);
      context.drawImage(img, (size - width) / 2 + at.x * ratio, (size - height) / 2 + at.y * ratio, width, height);
    },
    [scaleFor],
  );

  // Every change redraws the preview and makes a new crop to upload.
  useEffect(() => {
    if (!image || !canvasRef.current) return;
    draw(canvasRef.current, VIEW_SIZE, image, zoom, offset);
    const output = document.createElement("canvas");
    output.width = OUTPUT_SIZE;
    output.height = OUTPUT_SIZE;
    draw(output, OUTPUT_SIZE, image, zoom, offset);
    output.toBlob((blob) => {
      if (blob) onChangeRef.current(blob);
    }, "image/png");
  }, [image, zoom, offset, draw]);

  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, from: { x: event.clientX, y: event.clientY }, start: offset };
  }

  function moveDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (!image || drag.current?.pointer !== event.pointerId) return;
    const { from, start } = drag.current;
    setOffset(clamp({ x: start.x + event.clientX - from.x, y: start.y + event.clientY - from.y }, image, zoom));
  }

  function moveWithKeys(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!image) return;
    const moves: Record<string, Offset> = {
      ArrowLeft: { x: -KEY_STEP, y: 0 },
      ArrowRight: { x: KEY_STEP, y: 0 },
      ArrowUp: { x: 0, y: -KEY_STEP },
      ArrowDown: { x: 0, y: KEY_STEP },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setOffset((current) => clamp({ x: current.x + move.x, y: current.y + move.y }, image, zoom));
  }

  function changeZoom(next: number) {
    setZoom(next);
    if (image) setOffset((current) => clamp(current, image, next));
  }

  return (
    <div className={styles.cropper}>
      <canvas
        ref={canvasRef}
        width={VIEW_SIZE}
        height={VIEW_SIZE}
        className={styles.canvas}
        tabIndex={0}
        role="img"
        aria-label="Vista previa del logo. Arrástrala o usa las flechas del teclado para encuadrarla."
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={moveWithKeys}
      />
      <label className={styles.zoom}>
        <span>Acercar</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(event) => changeZoom(Number(event.target.value))}
          disabled={!image}
        />
      </label>
      <p className={styles.hint}>Arrastra la imagen para encuadrarla.</p>
    </div>
  );
}
