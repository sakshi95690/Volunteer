import { v2 as cloudinary } from "cloudinary";
import crypto from "crypto";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

let isConfigured = false;

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function getCloudinary() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      "Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your environment variables."
    );
  }

  if (!isConfigured) {
    cloudinary.config({
      cloud_name,
      api_key,
      api_secret,
      secure: true,
    });
    isConfigured = true;
  }

  return cloudinary;
}

export function validateImageBuffer(buffer: Buffer, mimeType: string): void {
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty image payload received.");
  }
  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(1);
    throw new Error(`Image size (${sizeMb}MB) exceeds the maximum allowed limit of 5MB.`);
  }

  const normalizedMime = mimeType.toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
    throw new Error(
      `Invalid image MIME type '${mimeType}'. Allowed formats are JPEG, PNG, and WebP.`
    );
  }

  // Magic bytes / binary header verification
  const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  if (!isJpeg && !isPng && !isWebp) {
    throw new Error("File content is corrupted or does not match a valid image signature (JPEG, PNG, WebP).");
  }
}

export async function uploadImage(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  bucketName = "volunteer-photos"
): Promise<string> {
  validateImageBuffer(buffer, mimeType);

  if (!isCloudinaryConfigured()) {
    console.log(
      "[Storage] Notice: Cloudinary credentials not configured. Using data URL fallback."
    );
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  const cld = getCloudinary();
  const envFolder = process.env.NODE_ENV === "production" ? "production" : "development";
  const folder = `seva-connect/${envFolder}/${bucketName}`;

  // Unique, collision-proof public ID with random salt
  const randomSalt = crypto.randomBytes(8).toString("hex");
  const cleanBase = originalFilename.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "upload";
  const publicId = `${cleanBase}-${Date.now()}-${randomSalt}`;

  return new Promise<string>((resolve, reject) => {
    const uploadStream = cld.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        overwrite: false,
      },
      (error, result) => {
        if (error || !result?.secure_url) {
          const errMsg = error?.message || "Cloudinary upload stream returned no secure_url";
          console.error("[Cloudinary Upload Error]:", errMsg);
          return reject(new Error(`Cloudinary upload failed: ${errMsg}`));
        }
        resolve(result.secure_url);
      }
    );

    uploadStream.end(buffer);
  });
}

export async function saveBase64Image(
  base64Data: string,
  prefix = "volunteer",
  bucketName = "volunteer-photos"
): Promise<string> {
  if (!base64Data || typeof base64Data !== "string") {
    throw new Error("Invalid base64 image data provided.");
  }

  // If already a remote hosted URL, return as-is
  if (
    base64Data.startsWith("https://res.cloudinary.com") ||
    base64Data.startsWith("http://") ||
    base64Data.startsWith("https://")
  ) {
    return base64Data;
  }

  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error("Invalid base64 image data URL format.");
  }

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], "base64");
  const ext = mimeType.includes("png") ? ".png" : mimeType.includes("webp") ? ".webp" : ".jpg";
  const filename = `${prefix}-${Date.now()}${ext}`;

  return uploadImage(buffer, filename, mimeType, bucketName);
}
