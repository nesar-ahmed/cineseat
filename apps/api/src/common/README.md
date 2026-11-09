# common/

Cross-cutting code, per the official Nest layout (guideline section 6). What is here
is used by more than one feature module, so no feature module imports another for it.

| Path | Purpose | Landed |
| --- | --- | --- |
| `guards/jwt-auth.guard.ts` | Requires a valid session (cookie or Bearer), user re-read from the DB | phase 1 |
| `guards/roles.guard.ts` | Enforces `@Roles('ADMIN')`; authenticated-but-forbidden is a 403 | phase 1 |
| `decorators/roles.decorator.ts` | Attaches required roles to a route or controller | phase 1 |
| `decorators/current-user.decorator.ts` | Injects the verified user (id always comes from the token) | phase 1 |
| `pipes/zod-validation.pipe.ts` | Validates a payload with a shared Zod schema and returns the parsed value | phase 1 |
| `filters/all-exceptions.filter.ts` | One error shape (`ApiError` in @cineseat/shared), no stacks leaked | phase 1 |
| `docs/openapi.ts` | Zod → OpenAPI schema, so docs cannot drift from validation | phase 1 |
| `security/password.ts` | bcrypt hashing/verification in one place | phase 1 |
| `constants/session.ts` | The session cookie name and its Swagger scheme name | phase 1 |
| `interfaces/auth.interface.ts` | `AuthUser` (on `request.user`) and `JwtPayload` (token claims) | phase 1 |
| interceptors (request logging) | shared response shaping | later phase |
