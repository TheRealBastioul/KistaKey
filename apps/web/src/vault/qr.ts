// QR decoding for adding TOTP: from an uploaded image (jsQR) or the live
// camera (BarcodeDetector where the browser has it, else jsQR on sampled
// frames). Everything runs in this tab: no frame or image leaves the
// browser. The camera stream is stopped by the function startQrScan
// returns; callers call it on success, close, unmount and hidden tab.
import jsQR from "jsqr";

/** Images are scaled down to this before decoding (jsQR is slow on huge screenshots). */
const MAX_IMAGE_SIDE = 2048;
const MAX_FRAME_SIDE = 960;
const SCAN_INTERVAL_MS = 150;

/** Not in TypeScript's DOM lib yet. */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

function pixels(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number,
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): ImageData | null {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function decode(image: ImageData | null): string | null {
  if (!image) return null;
  return (
    jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data ?? null
  );
}

/** The QR code's text, or null if the image has none. Throws if it isn't an image. */
export async function decodeQrImage(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    return decode(pixels(bitmap, bitmap.width, bitmap.height, MAX_IMAGE_SIDE));
  } finally {
    bitmap.close();
  }
}

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

async function barcodeDetector(): Promise<BarcodeDetectorLike | null> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const formats = await Detector.getSupportedFormats();
    return formats.includes("qr_code") ? new Detector({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

export interface QrScanHandlers {
  /** Called for every QR code seen; return true to stop scanning. */
  onCode(text: string): boolean;
  onError(error: Error): void;
}

/**
 * Starts the camera into `video` and scans until stopped. Returns the stop
 * function: it ends every track, so the camera light goes off.
 */
export function startQrScan(video: HTMLVideoElement, handlers: QrScanHandlers): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const canvas = document.createElement("canvas");

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    video.srcObject = null;
    canvas.width = 0;
    canvas.height = 0;
  };

  async function run() {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    if (stopped) {
      stop();
      return;
    }
    video.srcObject = stream;
    await video.play();
    const detector = await barcodeDetector();

    const tick = async () => {
      if (stopped) return;
      let text: string | null = null;
      if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        if (detector) {
          text = (await detector.detect(video).catch(() => []))[0]?.rawValue ?? null;
        } else {
          text = decode(pixels(video, video.videoWidth, video.videoHeight, MAX_FRAME_SIDE, canvas));
        }
      }
      if (stopped) return;
      if (text && handlers.onCode(text)) {
        stop();
        return;
      }
      timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
    };
    void tick();
  }

  run().catch((err: unknown) => {
    stop();
    handlers.onError(err instanceof Error ? err : new Error("The camera couldn't start"));
  });
  return stop;
}

/** A message for a getUserMedia failure. */
export function cameraErrorMessage(error: Error): string {
  if (error.name === "NotAllowedError") {
    return "Camera access was blocked. Allow it in the browser's site settings, or upload a screenshot of the QR code instead.";
  }
  if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
    return "No camera was found. Upload a screenshot of the QR code instead.";
  }
  if (error.name === "NotReadableError") {
    return "The camera is in use by another app.";
  }
  return "The camera couldn't start. Upload a screenshot of the QR code instead.";
}
