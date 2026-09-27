import * as Crypto from "expo-crypto";
import { api } from "./api";

// ──────────────────────────────────────────────────────────────────────────────
// Upload pipeline (mirrors the spec §5.3 / §11.2 client flow)
//
//   pick(uri) → hash → POST /records/presign → PUT to S3 → POST /records/confirm
//
// Memory: we read the file into a single ArrayBuffer. With the 25 MB ceiling
// this is fine on any modern phone. If we ever raise the cap we'd switch to
// streaming PUT + streaming SHA.
// ──────────────────────────────────────────────────────────────────────────────

const MAX_BYTES = 25 * 1024 * 1024;

export type RecordCategory =
  | "LAB_RESULT"
  | "PRESCRIPTION"
  | "IMAGING"
  | "DISCHARGE_SUMMARY"
  | "CONSULTATION_NOTE"
  | "VACCINATION"
  | "INSURANCE"
  | "OTHER";

export type UploadInput = {
  uri: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  title: string;
  category: RecordCategory;
  notes?: string;
};

export type UploadProgress =
  | { phase: "reading" }
  | { phase: "hashing" }
  | { phase: "presigning" }
  | { phase: "uploading"; pct: number }
  | { phase: "confirming" };

export class UploadError extends Error {
  constructor(public step: UploadProgress["phase"] | "validate", message: string) {
    super(message);
    this.name = "UploadError";
  }
}

// When `onBehalfOfPatientCode` is set, the upload routes through the caregiver
// endpoints (/caregivers/patients/:code/records/*) instead of the patient's own
// (/records/*). The pipeline is otherwise identical.
export async function uploadRecord(
  input: UploadInput,
  onProgress?: (p: UploadProgress) => void,
  onBehalfOfPatientCode?: string,
): Promise<{ recordId: string }> {
  const presignPath = onBehalfOfPatientCode
    ? `/caregivers/patients/${onBehalfOfPatientCode}/records/presign`
    : "/records/presign";
  const confirmPath = onBehalfOfPatientCode
    ? `/caregivers/patients/${onBehalfOfPatientCode}/records/confirm`
    : "/records/confirm";

  onProgress?.({ phase: "reading" });
  const buffer = await readFileAsArrayBuffer(input.uri);
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength === 0) throw new UploadError("validate", "Selected file is empty.");
  if (bytes.byteLength > MAX_BYTES)
    throw new UploadError("validate", `File exceeds the 25 MB limit (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB).`);

  onProgress?.({ phase: "hashing" });
  // expo-crypto wants an ArrayBuffer; pass the underlying buffer directly to
  // avoid the Uint8Array<ArrayBufferLike> vs BufferSource mismatch under TS 5.x.
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, buffer);
  const sha256Hex = bufferToHex(digest);
  const sha256B64 = bufferToBase64(digest);

  onProgress?.({ phase: "presigning" });
  const presign = await api<{ uploadUrl: string; s3Key: string; expiresInSeconds: number }>(
    presignPath,
    {
      method: "POST",
      body: {
        mimeType: input.mimeType,
        sizeBytes: bytes.byteLength,
        sha256: sha256Hex,
      },
    },
  );

  onProgress?.({ phase: "uploading", pct: 0 });
  await putToS3({
    url: presign.uploadUrl,
    mimeType: input.mimeType,
    bytes,
    sha256B64,
    onProgress: (pct) => onProgress?.({ phase: "uploading", pct }),
  });
  onProgress?.({ phase: "uploading", pct: 1 });

  onProgress?.({ phase: "confirming" });
  const result = await api<{ recordId: string }>(confirmPath, {
    method: "POST",
    body: {
      s3Key: presign.s3Key,
      category: input.category,
      title: input.title,
      ...(input.notes ? { notes: input.notes } : {}),
      mimeType: input.mimeType,
      sizeBytes: bytes.byteLength,
      sha256: sha256Hex,
    },
  });

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// File I/O — uses fetch(uri) which RN supports for file:// URIs from pickers.
// ──────────────────────────────────────────────────────────────────────────────

async function readFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  return res.arrayBuffer();
}

// ──────────────────────────────────────────────────────────────────────────────
// S3 PUT — uses XHR to surface upload progress (fetch() doesn't expose it).
// We sign the S3 URL server-side with a SHA-256 binding, so this header has to
// match what we passed to /presign or S3 will reject the upload.
// ──────────────────────────────────────────────────────────────────────────────

function putToS3(args: {
  url: string;
  mimeType: string;
  bytes: Uint8Array;
  sha256B64: string;
  onProgress?: (pct: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", args.url);
    xhr.setRequestHeader("Content-Type", args.mimeType);
    xhr.setRequestHeader("x-amz-checksum-sha256", args.sha256B64);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && args.onProgress) {
        args.onProgress(e.loaded / e.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new UploadError("uploading", `S3 upload failed: HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new UploadError("uploading", "Network error during upload"));
    xhr.send(args.bytes);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Encoding helpers
// ──────────────────────────────────────────────────────────────────────────────

function bufferToHex(buf: ArrayBuffer | Uint8Array): string {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < view.length; i++) {
    const h = view[i]!.toString(16);
    out += h.length === 1 ? `0${h}` : h;
  }
  return out;
}

function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]!);
  // RN polyfills btoa; on web it's native.
  // eslint-disable-next-line no-restricted-globals
  return globalThis.btoa(binary);
}
