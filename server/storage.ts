import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";
import { ENV } from "./_core/env";

let _client: S3Client | null = null;

function getClient() {
  if (!ENV.r2Endpoint || !ENV.r2AccessKeyId || !ENV.r2SecretAccessKey || !ENV.r2BucketName) {
    throw new Error("R2 storage config missing: set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME");
  }
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: ENV.r2Endpoint,
      credentials: {
        accessKeyId: ENV.r2AccessKeyId,
        secretAccessKey: ENV.r2SecretAccessKey,
      },
    });
  }
  return _client;
}

function normalizeKey(relKey: string) {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePrepareUpload(relKey: string): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const client = getClient();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: ENV.r2BucketName, Key: key }),
    { expiresIn: 900 },
  );
  return { key, url };
}

export async function storagePutStream(
  relKey: string,
  body: ReadableStream<Uint8Array>,
  contentType: string,
  contentLength: number,
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const client = getClient();
  const nodeStream = (await import("node:stream")).Readable.fromWeb(body as ReadableStream<any>);
  await client.send(new PutObjectCommand({
    Bucket: ENV.r2BucketName,
    Key: key,
    Body: nodeStream,
    ContentType: contentType,
    ContentLength: contentLength,
  }));
  return { key, url: `/manus-storage/${key}` };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const client = getClient();
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  await client.send(new PutObjectCommand({
    Bucket: ENV.r2BucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentLength: body.length,
  }));
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: ENV.r2BucketName, Key: key }),
    { expiresIn: 900 },
  );
}
