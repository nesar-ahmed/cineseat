import { BadRequestException } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { diskStorage } from 'multer';
import type { MulterModuleOptions } from '@nestjs/platform-express';

/** Public URL prefix mounted by `main.ts` (`/uploads/…` → files under `UPLOAD_DIR`). */
export const UPLOAD_URL_PREFIX = '/uploads';

/** Avatars live in their own subfolder, so nothing else can be written through this route. */
export const AVATAR_SUBFOLDER = 'avatars';
/** Type allowlist doubles as the extension allowlist, so no `.php`/`.html` ever lands on disk. */
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** The documented limit and the enforced one are the same constant. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/**
 * Multer options for avatar uploads (guideline 13: restricted type and size,
 * generated names, stored outside the source tree). The folder is created on
 * boot so the first upload cannot fail on a missing path.
 */
export function avatarMulterOptions(uploadDir: string): MulterModuleOptions {
  const destination = resolve(uploadDir, AVATAR_SUBFOLDER);
  mkdirSync(destination, { recursive: true });

  return {
    storage: diskStorage({
      destination: (_request, _file, cb) => cb(null, destination),
      filename: (_request, file, cb) =>
        cb(null, `${randomUUID()}${ALLOWED_IMAGE_TYPES[file.mimetype] ?? ''}`),
    }),
    limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
    fileFilter: (_request, file, cb) => {
      if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
        cb(new BadRequestException('Avatar must be a JPEG, PNG or WebP image'), false);
        return;
      }
      cb(null, true);
    },
  };
}
