import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
export const opaque = () => randomBytes(32).toString("base64url");
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const hashPassword = (s: string) =>
  argon2.hash(s, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
export const verifyPassword = (hash: string, s: string) =>
  argon2.verify(hash, s);
export class DomainError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
