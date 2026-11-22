import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminDashboardSchema, type AdminDashboard } from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { Roles } from '../common/decorators/roles.decorator';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminDashboardService } from './admin-dashboard.service';

/** The admin panel's own read models. Every route here is ADMIN only. */
@ApiTags('admin')
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Dashboard figures — ADMIN only',
    description:
      'Revenue, tickets, bookings and sign-ups for the last 7 days (with the 7 before), occupancy of the coming week, live holds, refunds, sales per day for 14 days, the next shows, the latest paid bookings and the best sellers.',
  })
  @ApiResponse({
    status: 200,
    description: 'The dashboard.',
    schema: toOpenApiSchema(AdminDashboardSchema),
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  get(): Promise<AdminDashboard> {
    return this.dashboard.dashboard();
  }
}
