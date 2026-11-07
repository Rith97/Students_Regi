import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

// Photos live in a private bucket. Student rows keep only "obj:<key>"; the API
// returns image bytes to authorised callers, never a public link.
export const PHOTO_BUCKET = "student-photos";
export const PHOTO_PREFIX = "obj:";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const DATA_URL = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i;

let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) s3 = new S3Client({ forcePathStyle: true });
  return s3;
}

export function photoObjectKey(value: unknown): string {
  const text = String(value || "").trim();
  if (!text.startsWith(PHOTO_PREFIX)) return "";
  const key = text.slice(PHOTO_PREFIX.length);
  return /^students\/[A-Za-z0-9._-]{8,200}$/.test(key) ? key : "";
}

export type PhotoKind = "storage" | "sheet" | "url" | "drive" | "missing" | "unknown";
export function photoStorageKind(value: unknown): PhotoKind {
  const text = String(value || "").trim();
  if (!text) return "missing";
  if (photoObjectKey(text)) return "storage";
  if (/^drive:/.test(text)) return "drive";
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(text)) return "sheet";
  if (/^https:\/\//i.test(text)) return "url";
  return "unknown";
}

function safeName(student: { studentCode?: string; id?: string }): string {
  const identity = String(student.studentCode || student.id || "student").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 60) || "student";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  return `${identity}-${stamp}-${randomUUID().slice(0, 8)}`;
}

export async function savePhoto(value: unknown, student: { studentCode?: string; id?: string }): Promise<string> {
  const text = String(value || "").trim();
  if (!text || photoObjectKey(text)) return text;
  const match = text.match(DATA_URL);
  if (!match) return text;
  const subtype = match[1].toLowerCase();
  const mime = subtype === "png" ? "image/png" : subtype === "webp" ? "image/webp" : "image/jpeg";
  const bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!bytes.length) throw new Error("Student photo is empty");
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error("Student photo exceeds the 5 MB limit");
  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const key = `students/${safeName(student)}.${extension}`;
  await client().send(new PutObjectCommand({
    Bucket: PHOTO_BUCKET, Key: key, Body: bytes, ContentType: mime,
    Metadata: {
      recordid: String(student.id || "").replace(/[^\x20-\x7e]/g, ""),
      studentcode: String(student.studentCode || "").replace(/[^\x20-\x7e]/g, ""),
      sourcelength: String(text.length)
    }
  }));
  return PHOTO_PREFIX + key;
}

export async function photoForClient(value: unknown): Promise<string> {
  const text = String(value || "").trim();
  const key = photoObjectKey(text);
  if (!key) return /^(?:data:image\/(?:png|jpe?g|webp);base64,|https:\/\/)/i.test(text) ? text : "";
  try {
    const result = await client().send(new GetObjectCommand({ Bucket: PHOTO_BUCKET, Key: key }));
    const mime = String(result.ContentType || "image/jpeg").toLowerCase();
    if (!/^image\/(?:png|jpe?g|webp)$/.test(mime)) return "";
    const bytes = await result.Body!.transformToByteArray();
    return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch (error) {
    console.error("Cannot read student photo", key, error);
    return "";
  }
}

export async function photoStoredSourceLength(value: unknown): Promise<number> {
  const text = String(value || "").trim();
  const key = photoObjectKey(text);
  if (!key) return text.length;
  try {
    const head = await client().send(new HeadObjectCommand({ Bucket: PHOTO_BUCKET, Key: key }));
    const length = Number(head.Metadata?.sourcelength);
    return Number.isFinite(length) && length > 0 ? length : text.length;
  } catch {
    return text.length;
  }
}
