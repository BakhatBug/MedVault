import { S3Client } from "@aws-sdk/client-s3";
import { config } from "../config.js";

// Single shared client. In prod (AWS), credentials come from the IAM role on the
// EC2/ECS task — we don't pass them. In dev (MinIO), we pass the static creds
// from env so the SDK has something to sign with.
const credentials =
  config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY
    ? { accessKeyId: config.AWS_ACCESS_KEY_ID, secretAccessKey: config.AWS_SECRET_ACCESS_KEY }
    : undefined;

export const s3 = new S3Client({
  region: config.AWS_REGION,
  ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  ...(credentials ? { credentials } : {}),
});
