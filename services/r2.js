const {
   DeleteObjectCommand,
   PutObjectCommand,
   S3Client,
} = require("@aws-sdk/client-s3");
const crypto = require("crypto");

const PROFILE_EXTENSIONS = {
   "image/jpeg": "jpg",
   "image/png": "png",
   "image/gif": "gif",
};

let client;

function requiredConfiguration() {
   const accountId = process.env.R2_ACCOUNT_ID?.trim();
   const endpoint = process.env.R2_ENDPOINT?.trim()
      || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
   const config = {
      endpoint,
      accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim(),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim(),
      bucket: process.env.R2_BUCKET?.trim(),
      publicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, ""),
   };
   const missing = Object.entries(config)
      .filter(([, value]) => !value)
      .map(([key]) => key);

   if (missing.length > 0) {
      throw new Error(`R2 is not configured. Missing: ${missing.join(", ")}`);
   }

   const endpointUrl = new URL(config.endpoint);
   endpointUrl.pathname = "";
   endpointUrl.search = "";
   endpointUrl.hash = "";
   config.endpoint = endpointUrl.toString().replace(/\/$/, "");
   config.publicBaseUrl = new URL(config.publicBaseUrl).toString().replace(/\/$/, "");
   return config;
}

function getClient(config) {
   if (!client) {
      client = new S3Client({
         region: "auto",
         endpoint: config.endpoint,
         credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
         },
      });
   }
   return client;
}

function publicUrl(baseUrl, key) {
   const encodedKey = key.split("/").map(encodeURIComponent).join("/");
   return `${baseUrl}/${encodedKey}`;
}

async function uploadProfileImage({ userId, buffer, contentType }) {
   const extension = PROFILE_EXTENSIONS[contentType];
   if (!extension) throw new Error("Unsupported profile image type");

   const config = requiredConfiguration();
   const key = `profile-pictures/${userId}/${crypto.randomUUID()}.${extension}`;
   await getClient(config).send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentLength: buffer.length,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
   }));

   return { key, url: publicUrl(config.publicBaseUrl, key) };
}

async function deleteObject(key) {
   if (!key) return;
   const config = requiredConfiguration();
   await getClient(config).send(new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
   }));
}

function keyFromPublicUrl(objectUrl) {
   if (!objectUrl) return null;
   const config = requiredConfiguration();
   const base = `${config.publicBaseUrl}/`;
   if (!objectUrl.startsWith(base)) return null;
   return objectUrl.slice(base.length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
}

async function deleteProfileImageByUrl(objectUrl) {
   const key = keyFromPublicUrl(objectUrl);
   if (key) await deleteObject(key);
}

module.exports = {
   deleteObject,
   deleteProfileImageByUrl,
   uploadProfileImage,
};
