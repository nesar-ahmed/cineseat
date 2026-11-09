import { z } from 'zod';
import { ListQuerySchema, paginatedSchema, type Paginated } from './common';
import { UserRole } from './enums';

/**
 * Auth and profile contracts (guideline sections 2.1, 10 and 13).
 * These schemas validate every auth request server-side and type the
 * session/profile shapes client-side — one source of truth for both apps.
 */

/** Lowercased, trimmed email: the lookup key for signup and login. */
export const EmailSchema = z.string().trim().toLowerCase().email('Use a valid email address');

/**
 * 8–72 characters (bcrypt only reads the first 72 bytes), at least one letter
 * and one digit. Same rule for signup and password change.
 */
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

/** Loose international mobile format, e.g. 01700000001 or +8801700000001. */
export const PhoneSchema = z.string().trim().regex(/^\+?[0-9]{6,15}$/, 'Use a valid phone number');

export const GenreSchema = z.string().trim().min(2).max(30);

export const SignupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: EmailSchema,
  password: PasswordSchema,
});
export type SignupInput = z.infer<typeof SignupSchema>;

/** Password is not length-checked here: a wrong-length stored hash should not be a 400. */
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof LoginSchema>;

/** PATCH /users/me — at least one field must be present. */
export const UpdateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    phone: PhoneSchema,
    preferredCity: z.string().trim().min(2).max(60),
    /** Distinct genres; the API stores them comma-separated in SQLite. */
    preferredGenres: z.array(GenreSchema).max(10),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(200),
  newPassword: PasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

/** Avatar upload response — `avatarUrl` is the public path under /uploads/. */
export const AvatarSchema = z.object({
  avatarUrl: z.string(),
});
export type Avatar = z.infer<typeof AvatarSchema>;

/**
 * What the API exposes about a user. `passwordHash` is never part of any
 * response shape, so it cannot leak by forgetting to strip it.
 */
export const PublicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: UserRole,
  preferredCity: z.string().nullable(),
  preferredGenres: z.array(z.string()),
  createdAt: z.string(), // ISO string, because JSON has no Date
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

/** POST /auth/signup and POST /auth/login body; the token itself is the cookie. */
export const AuthResponseSchema = z.object({ user: PublicUserSchema });
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/** GET /auth/me */
export const MeResponseSchema = AuthResponseSchema;
export type MeResponse = AuthResponse;

/** Query for the admin user list: pagination + search on name/email + role filter. */
export const UserListQuerySchema = ListQuerySchema.extend({
  role: UserRole.optional(),
});
export type UserListQuery = z.infer<typeof UserListQuerySchema>;

export const PaginatedUsersSchema = paginatedSchema(PublicUserSchema);
export type PaginatedUsers = Paginated<PublicUser>;

/** Claims carried by the access token (verified by JwtStrategy, never trusted from the client). */
export const JwtClaimsSchema = z.object({
  sub: z.string(), // user id
  email: z.string(),
  role: UserRole,
});
export type JwtClaims = z.infer<typeof JwtClaimsSchema>;
