import * as bcrypt from 'bcryptjs';

/**
 * Password hashing in one place (guideline 2.1: bcrypt; 13: never log passwords).
 * `bcryptjs` is pure JavaScript, so hashing works offline with no native build —
 * the same library the seed script uses, which keeps hashes interchangeable.
 */
const BCRYPT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Constant-time comparison inside bcrypt; callers must not reveal which half failed. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
