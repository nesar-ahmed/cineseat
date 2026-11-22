import { BadRequestException } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { diskStorage } from 'multer';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import { MAX_POSTER_BYTES, POSTER_MIME_TYPES } from '@cineseat/shared';

/** Posters live next to avatars under UPLOAD_DIR and are served from `/uploads/posters/…`. */
export const POSTER_SUBFOLDER = 'posters';

/**
 * Type allowlist doubles as the extension allowlist (same rule as avatars). The
 * types and the size limit live in @cineseat/shared, so the admin panel checks
 * a file before sending it with exactly the rules applied here.
 */
const ALLOWED_IMAGE_TYPES: Record<(typeof POSTER_MIME_TYPES)[number], string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const isAllowed = (mime: string): mime is keyof typeof ALLOWED_IMAGE_TYPES =>
  (POSTER_MIME_TYPES as readonly string[]).includes(mime);

/** Posters are larger than avatars, but still bounded. */
export { MAX_POSTER_BYTES };

export function posterMulterOptions(uploadDir: string): MulterModuleOptions {
  const destination = resolve(uploadDir, POSTER_SUBFOLDER);
  mkdirSync(destination, { recursive: true });

  return {
    storage: diskStorage({
      destination: (_request, _file, cb) => cb(null, destination),
      filename: (_request, file, cb) =>
        cb(
          null,
          `${randomUUID()}${isAllowed(file.mimetype) ? ALLOWED_IMAGE_TYPES[file.mimetype] : ''}`,
        ),
    }),
    limits: { fileSize: MAX_POSTER_BYTES, files: 1 },
    fileFilter: (_request, file, cb) => {
      if (!isAllowed(file.mimetype)) {
        cb(new BadRequestException('Poster must be a JPEG, PNG or WebP image'), false);
        return;
      }
      cb(null, true);
    },
  };
}
