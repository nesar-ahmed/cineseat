import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminUserActivity,
  AdminUserDetailSchema,
  AdminUserListQuerySchema,
  AdminUserListSchema,
  AdminUserSort,
  SortOrder,
  UserRole,
  type AdminUserDetail,
  type AdminUserList,
  type AdminUserListQuery,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiQueries } from '../common/docs/admin-queries';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminUsersService } from './admin-users.service';

const day = (name: string, description: string) =>
  ApiQuery({ name, required: false, description, schema: { type: 'string', format: 'date' } });

/**
 * Accounts for the admin panel. ADMIN only. The role is changed with
 * PATCH /users/:id/role, which applies the limits reported here.
 */
@ApiTags('admin')
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Accounts for the admin panel — ADMIN only',
    description:
      'Every account with its paid bookings, money paid and refunded, and when it last booked. `counts` gives accounts per role with every other filter applied (role tabs).',
  })
  @ApiQueries(
    ApiQuery({
      name: 'search',
      required: false,
      description: 'Matches name, email or phone (case-insensitive), or an exact account id.',
      schema: { type: 'string' },
    }),
    ApiQuery({ name: 'role', required: false, schema: { type: 'string', enum: UserRole.options } }),
    ApiQuery({
      name: 'activity',
      required: false,
      description: '`booked`: has a paid booking; `never`: has none.',
      schema: { type: 'string', enum: AdminUserActivity.options },
    }),
    day('joinedFrom', 'Joined on or after this cinema day (YYYY-MM-DD).'),
    day('joinedTo', 'Joined on or before this cinema day (YYYY-MM-DD).'),
    ApiQuery({
      name: 'sort',
      required: false,
      description:
        '`bookings` = paid bookings, `spent` = successful payments, `lastBooking` (never booked last).',
      schema: { type: 'string', enum: AdminUserSort.options, default: 'joined' },
    }),
    ApiQuery({
      name: 'order',
      required: false,
      description: 'Defaults to `asc` for `name`, `desc` for everything else.',
      schema: { type: 'string', enum: SortOrder.options },
    }),
    ApiQuery({
      name: 'page',
      required: false,
      schema: { type: 'integer', minimum: 1, default: 1 },
    }),
    ApiQuery({
      name: 'pageSize',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
  )
  @ApiResponse({
    status: 200,
    description: 'A page of accounts.',
    schema: toOpenApiSchema(AdminUserListSchema),
  })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  list(
    @Query(new ZodValidationPipe(AdminUserListQuerySchema)) query: AdminUserListQuery,
  ): Promise<AdminUserList> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One account for the admin panel — ADMIN only',
    description:
      'The profile with its figures (paid bookings, tickets, upcoming, not completed, spent, refunded, first and last booking), what it books most (movies, theaters), whether the signed-in admin may change its role and why not, and its role changes (`history`). Its bookings and payments are GET /admin/bookings?user= and GET /admin/payments?user=.',
  })
  @ApiParam({ name: 'id', description: 'Account id' })
  @ApiResponse({
    status: 200,
    description: 'The account.',
    schema: toOpenApiSchema(AdminUserDetailSchema),
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No account with this id.', schema: ERROR_SCHEMA })
  detail(@CurrentUser('id') adminId: string, @Param('id') id: string): Promise<AdminUserDetail> {
    return this.users.detail(id, adminId);
  }
}
