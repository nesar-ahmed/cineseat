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
  AdminScheduleFilter,
  AdminTheaterDetailSchema,
  AdminTheaterListQuerySchema,
  AdminTheaterListSchema,
  AdminTheaterSort,
  ShowFormat,
  SortOrder,
  type AdminTheaterDetail,
  type AdminTheaterList,
  type AdminTheaterListQuery,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiQueries, listQuery } from '../common/docs/admin-queries';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminTheatersService } from './admin-theaters.service';

/**
 * The theaters module's read side for the admin panel. Every route is ADMIN
 * only. Changes go through the resources (POST/PATCH/DELETE /theaters,
 * POST /theaters/:id/screens, PATCH/DELETE /screens/:id), which enforce the
 * limits reported here.
 */
@ApiTags('admin')
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/theaters')
export class AdminTheatersController {
  constructor(private readonly theaters: AdminTheatersService) {}

  @Get()
  @ApiOperation({
    summary: 'Cinemas for the admin panel — ADMIN only',
    description:
      'Every cinema with its screens (name, formats, seats), today’s shows and all-time figures: shows, upcoming shows, the next one, tickets, revenue, and occupancy of what has not started. `counts.cities` gives the cinemas per city with every other filter applied, for city tabs.',
  })
  @ApiQueries(
    ApiQuery({
      name: 'search',
      required: false,
      description:
        'Matches name, city, address, an amenity or a screen’s name (case-insensitive), or an exact theater id.',
      schema: { type: 'string' },
    }),
    listQuery('city', 'Any of these cities.'),
    listQuery('amenity', 'Offers any of these amenities.'),
    listQuery('format', 'Has a screen that can show any of these formats.', ShowFormat.options),
    ApiQuery({
      name: 'schedule',
      required: false,
      description: '`scheduled`: has a show that has not started; `unscheduled`: has none.',
      schema: { type: 'string', enum: AdminScheduleFilter.options },
    }),
    ApiQuery({
      name: 'sort',
      required: false,
      description:
        '`city` sorts by city, then name; `shows` = upcoming shows; `occupancy` = share sold of what has not started.',
      schema: { type: 'string', enum: AdminTheaterSort.options, default: 'city' },
    }),
    ApiQuery({
      name: 'order',
      required: false,
      description: 'Defaults to `asc` for `city` and `name`, `desc` for figures.',
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
    description: 'A page of cinemas.',
    schema: toOpenApiSchema(AdminTheaterListSchema),
  })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  list(
    @Query(new ZodValidationPipe(AdminTheaterListQuerySchema)) query: AdminTheaterListQuery,
  ): Promise<AdminTheaterList> {
    return this.theaters.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One cinema for the admin panel — ADMIN only',
    description:
      'The cinema with every screen: its layout as entered (rows, cols, premium and recliner rows), seats per category, figures and limits (`constraints`: can it be deleted, is its layout locked, which formats upcoming shows use). Plus the next shows across its screens and the recorded changes to the cinema and its screens (`history`, deleted screens included).',
  })
  @ApiParam({ name: 'id', description: 'Theater id' })
  @ApiResponse({
    status: 200,
    description: 'The cinema.',
    schema: toOpenApiSchema(AdminTheaterDetailSchema),
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No theater with this id.', schema: ERROR_SCHEMA })
  detail(@Param('id') id: string): Promise<AdminTheaterDetail> {
    return this.theaters.detail(id);
  }
}
