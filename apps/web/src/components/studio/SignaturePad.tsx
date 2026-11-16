"use client";

import { useEffect, useRef, useState } from "react";

import Button from "@/components/ui/Button";

const WIDTH = 520;
const HEIGHT = 200;
const PAD = 8;

interface SignaturePadProps {
  /** Called with a transparent PNG cropped to the drawing. */
  onDone: (file: File) => void;
  onCancel: () => void;
}

/** Draw a signature with the mouse, a finger or a pen. */
export default function SignaturePad({ onDone, onCancel }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const bounds = useRef({ left: WIDTH, top: HEIGHT, right: 0, bottom: 0 });
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");

    if (!context) return;

    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1b2a6b";
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();

    return {
      x: ((event.clientX - box.left) / box.width) * WIDTH,
      y: ((event.clientY - box.top) / box.height) * HEIGHT,
    };
  }

  function grow(x: number, y: number) {
    const b = bounds.current;

    b.left = Math.min(b.left, x);
    b.top = Math.min(b.top, y);
    b.right = Math.max(b.right, x);
    b.bottom = Math.max(b.bottom, y);
  }

  function clear() {
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, WIDTH, HEIGHT);
    bounds.current = { left: WIDTH, top: HEIGHT, right: 0, bottom: 0 };
    setEmpty(true);
  }

  function finish() {
    const canvas = canvasRef.current;

    if (!canvas || empty) return;

    const b = bounds.current;
    const left = Math.max(0, Math.floor(b.left - PAD));
    const top = Math.max(0, Math.floor(b.top - PAD));
    const width = Math.min(WIDTH, Math.ceil(b.right + PAD)) - left;
    const height = Math.min(HEIGHT, Math.ceil(b.bottom + PAD)) - top;
    const out = document.createElement("canvas");

    out.width = width;
    out.height = height;
    out.getContext("2d")?.drawImage(canvas, left, top, width, height, 0, 0, width, height);
    out.toBlob((blob) => {
      if (blob) onDone(new File([blob], "signature.png", { type: "image/png" }));
    }, "image/png");
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        aria-label="Signature drawing area"
        className="h-auto w-full touch-none cursor-crosshair rounded-ctl border border-line-strong bg-white"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;

          const { x, y } = point(event);
          const context = event.currentTarget.getContext("2d");

          context?.beginPath();
          context?.moveTo(x, y);
          context?.lineTo(x + 0.01, y);
          context?.stroke();
          grow(x, y);
          setEmpty(false);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;

          const { x, y } = point(event);
          const context = event.currentTarget.getContext("2d");

          context?.lineTo(x, y);
          context?.stroke();
          grow(x, y);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={clear} disabled={empty}>
          Clear
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" className="ml-auto" onClick={finish} disabled={empty}>
          Use this signature
        </Button>
      </div>
    </div>
  );
}
