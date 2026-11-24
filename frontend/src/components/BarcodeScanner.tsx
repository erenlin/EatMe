// Camera overlay that scans for a barcode and fires onScan() with the value.
// Uses the native BarcodeDetector Web API — no library needed.
// Supported: Chrome 83+, Chrome on Android, Safari 17+.
import { useEffect, useRef, useState } from "react";
import "../styles/BarcodeScanner.css";

// BarcodeDetector is not yet in TypeScript's standard lib.
interface BarcodeResult {
  rawValue: string;
  format: string;
}
interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<BarcodeResult[]>;
}
interface BarcodeDetectorStatic {
  new (options?: { formats: string[] }): BarcodeDetectorInstance;
}
declare const BarcodeDetector: BarcodeDetectorStatic | undefined;

type Props = {
  onScan: (barcode: string) => void;
  onClose: () => void;
};

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

const NOT_SUPPORTED = "Barcode scanning isn't supported on this browser. Try Chrome or Safari 17+.";

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Compute support at render time — not in an effect — to satisfy react-hooks/set-state-in-effect.
  const supported = typeof BarcodeDetector !== "undefined";
  const [cameraError, setCameraError] = useState("");
  const [ready, setReady] = useState(false); // true once the camera is live

  const error = !supported ? NOT_SUPPORTED : cameraError;

  useEffect(() => {
    if (!supported) return;

    let stream: MediaStream | null = null;
    let frameId: number;
    let finished = false; // set to true once a barcode is found or on cleanup

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }, // prefer the back camera
        });
      } catch (err) {
        if (finished) return;
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setCameraError("Camera permission denied. Allow camera access in your browser settings and try again.");
        } else {
          setCameraError("Could not open the camera.");
        }
        return;
      }

      if (finished || !videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setReady(true);

      const detector = new BarcodeDetector({ formats: FORMATS });

      async function scan() {
        if (finished || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          if (results.length > 0 && !finished) {
            finished = true;
            onScan(results[0].rawValue);
            return; // onScan closes the scanner, so stop here
          }
        } catch {
          // A single failed frame is fine — keep scanning.
        }
        frameId = requestAnimationFrame(scan);
      }
      frameId = requestAnimationFrame(scan);
    }

    start();

    return () => {
      finished = true;
      cancelAnimationFrame(frameId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan, supported]);

  return (
    <div className="barcode-overlay" role="dialog" aria-modal="true" aria-label="Scan barcode">
      <div className="barcode-modal">
        <div className="barcode-header">
          <h2 className="barcode-title">Scan barcode</h2>
          <button type="button" className="barcode-close" onClick={onClose} aria-label="Close scanner">
            ×
          </button>
        </div>

        {error ? (
          <p className="barcode-error" role="alert">{error}</p>
        ) : (
          <div className="barcode-viewfinder">
            {/* muted + playsInline are required for autoplay on iOS Safari */}
            <video ref={videoRef} className="barcode-video" muted playsInline />
            {ready && (
              <>
                <div className="barcode-reticle" aria-hidden="true" />
                <p className="barcode-hint">Point the camera at a barcode</p>
              </>
            )}
            {!ready && !error && (
              <p className="barcode-loading">Opening camera…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
