import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from "file-type";
import { createConnection } from "node:net";
import { DomainError } from "./security.js";
export const bucket = () => process.env.S3_BUCKET ?? "kost-private";
export const storage = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "local-development",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "local-development-only",
  },
});
export async function validatePrivateFile(bytes: Buffer) {
  if (bytes.length === 0 || bytes.length > 10485760)
    throw new DomainError(422, "VALIDATION_ERROR");
  const type = await fileTypeFromBuffer(bytes);
  if (
    !type ||
    !["application/pdf", "image/jpeg", "image/png"].includes(type.mime)
  )
    throw new DomainError(422, "VALIDATION_ERROR");
  return type.mime;
}
export async function storeObject(key: string, bytes: Buffer, mime: string) {
  await storage.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: bytes,
      ContentType: mime,
    }),
  );
}
export async function readObject(key: string) {
  const object = await storage.send(
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
  );
  if (!object.Body) throw Error("Missing object");
  return Buffer.from(await object.Body.transformToByteArray());
}
export async function removeObject(key: string) {
  await storage.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
export async function scanBytes(bytes: Buffer): Promise<"clean" | "rejected"> {
  return new Promise((resolve, reject) => {
    const port = Number(process.env.CLAMD_PORT ?? 3310),
      host = process.env.CLAMD_HOST ?? "127.0.0.1";
    const socket = createConnection({ host, port });
    let response = "";
    const fail = () => {
      socket.destroy();
      reject(new DomainError(503, "SCAN_UNAVAILABLE"));
    };
    socket.setTimeout(30000, fail);
    socket.on("error", fail);
    socket.on("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0"));
      for (let offset = 0; offset < bytes.length; offset += 65536) {
        const block = bytes.subarray(offset, offset + 65536);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(block.length);
        socket.write(length);
        socket.write(block);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (data) => {
      response += data.toString();
      if (response.length > 4096) fail();
    });
    socket.on("end", () => {
      if (response.includes(" FOUND")) resolve("rejected");
      else if (response.trim().replace(/\0/g, "") === "stream: OK")
        resolve("clean");
      else reject(new DomainError(503, "SCAN_UNAVAILABLE"));
    });
  });
}
