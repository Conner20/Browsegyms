import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";

const accountId = process.env.R2_ACCOUNT_ID?.trim();
const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
const bucket = process.env.R2_BUCKET_NAME?.trim();
const configuredPublicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();
const publicBaseUrl = configuredPublicBaseUrl
    ? (/^https?:\/\//i.test(configuredPublicBaseUrl) ? configuredPublicBaseUrl : `https://${configuredPublicBaseUrl}`).replace(/\/+$/, "")
    : undefined;

export const isR2Configured = Boolean(
    accountId && accessKeyId && secretAccessKey && bucket && publicBaseUrl,
);

export const r2Config = isR2Configured
    ? {
          accountId: accountId!,
          bucket: bucket!,
          publicBaseUrl: publicBaseUrl!,
      }
    : null;

export const r2Client = isR2Configured
    ? new S3Client({
          region: "auto",
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: {
              accessKeyId: accessKeyId!,
              secretAccessKey: secretAccessKey!,
          },
      })
    : null;

const MIME_EXTENSIONS: Record<string, string> = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

export const ALLOWED_IMAGE_TYPES = new Set(Object.keys(MIME_EXTENSIONS));

function safeSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "unknown";
}

export function createR2ObjectKey({
    userId,
    purpose,
    contentType,
}: {
    userId: string;
    purpose: string;
    contentType: string;
}) {
    const extension = MIME_EXTENSIONS[contentType] ?? "bin";
    return `users/${safeSegment(userId)}/${safeSegment(purpose)}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

export function r2PublicUrl(key: string) {
    if (!r2Config) throw new Error("R2 is not configured");
    return `${r2Config.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function r2KeyFromUrl(url: string) {
    if (!r2Config) return null;
    try {
        const base = new URL(`${r2Config.publicBaseUrl}/`);
        const parsed = new URL(url);
        if (parsed.origin !== base.origin) return null;
        const basePath = base.pathname.replace(/\/+$/, "");
        if (basePath && !parsed.pathname.startsWith(`${basePath}/`)) return null;
        return decodeURIComponent(parsed.pathname.slice(basePath.length).replace(/^\/+/, "")) || null;
    } catch {
        return null;
    }
}

export async function createR2UploadUrl(key: string, contentType: string) {
    if (!r2Client || !r2Config) throw new Error("R2 is not configured");
    return getSignedUrl(
        r2Client,
        new PutObjectCommand({
            Bucket: r2Config.bucket,
            Key: key,
            ContentType: contentType,
        }),
        { expiresIn: 5 * 60 },
    );
}

export async function putR2Object(key: string, body: Uint8Array, contentType: string) {
    if (!r2Client || !r2Config) throw new Error("R2 is not configured");
    await r2Client.send(
        new PutObjectCommand({
            Bucket: r2Config.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
        }),
    );
    return r2PublicUrl(key);
}

export async function deleteR2Object(key: string) {
    if (!r2Client || !r2Config) return;
    await r2Client.send(new DeleteObjectCommand({ Bucket: r2Config.bucket, Key: key }));
}
