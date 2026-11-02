import "dotenv/config";
import { HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { storage, bucket } from "../src/server/storage.js";
try {
  await storage.send(new HeadBucketCommand({ Bucket: bucket() }));
} catch (e) {
  if (
    (e as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode !== 404
  )
    throw e;
  await storage.send(new CreateBucketCommand({ Bucket: bucket() }));
}
console.log("Private bucket available: " + bucket());
storage.destroy();
