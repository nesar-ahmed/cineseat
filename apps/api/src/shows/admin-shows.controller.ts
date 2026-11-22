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
  AdminShowDetailSchema,
  AdminShowListQuerySchema,
  AdminShowListSchema,
  AdminShowSort,
  AdminShowTicketsFilter,
  AdminShowWhen,
  ShowAvailability,
  ShowFormat,
  SortOrder,
  type AdminShowDetail,
  type AdminShowList,
  type AdminShowListQuery,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiQueries, listQuery } from '../common/docs/admin-queries';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminShowsService } from './admin-shows.service';

/**
 * The showtimes module's read side for the admin panel. Every route is ADMIN
 * only. Changes go through the show resource (POST /shows, /shows/batch,
 * PATCH/DELETE /shows/:id, /shows/bulk), which enforces the rules reported here.
 */
@ApiTags('admin')
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/shows')
export class AdminShowsController {
  constructor(private readonly shows: AdminShowsService) {}

  @Get()
  @ApiOperation({
    summary: 'Showtimes for the admin panel — ADMIN only',
    description:
      'Every show, past and upcoming, with its seats (sold, live holds, available), paid bookings and revenue, whether it is `locked` (started, or seats sold or held), and its state (UPCOMING, RUNNING, ENDED). `counts` gives the shows per `when` tab with every other filter applied. For a day on one screen (a timeline), ask for `when=all&from=D&to=D&screen=…`.',
  })
  @ApiQueries(
    ApiQuery({
      name: 'search',
      required: false,
      description:
        'Matches movie title, theater, screen or city (case-insensitive), or an exact show id.',
      schema: { type: 'string' },
    }),
    ApiQuery({
      name: 'when',
      required: false,
      description: '`upcoming`: not started; `today`: the cinemas’ today; `past`: started; `all`.',
      schema: { type: 'string', enum: AdminShowWhen.options, default: 'upcoming' },
    }),
    ApiQuery({
      name: 'from',
      required: false,
      description: 'On or after this cinema day (YYYY-MM-DD).',
      schema: { type: 'string', format: 'date' },
    }),
    ApiQuery({
      name: 'to',
      required: false,
      description: 'On or before this cinema day (YYYY-MM-DD).',
      schema: { type: 'string', format: 'date' },
    }),
    listQuery('movie', 'Any of these movie ids.'),
    listQuery('theater', 'Any of these theater ids.'),
    listQuery('screen', 'Any of these screen ids.'),
    listQuery('city', 'Any of these cities.'),
    listQuery('format', 'Any of these formats.', ShowFormat.options),
    listQuery('language', 'Any of these languages.'),
    listQuery(
      'availability',
      'Any of these (the label buyers see: share of seats sold or held).',
      ShowAvailability.options,
    ),
    ApiQuery({
      name: 'tickets',
      required: false,
      description: '`sold`: at least one seat sold; `unsold`: none.',
      schema: { type: 'string', enum: AdminShowTicketsFilter.options },
    }),
    ApiQuery({
      name: 'sort',
      required: false,
      description: '`sold` = seats sold, `occupancy` = share sold, `price` = base price.',
      schema: { type: 'string', enum: AdminShowSort.options, default: 'startsAt' },
    }),
    ApiQuery({
      name: 'order',
      required: false,
      description:
        'Defaults to the natural direction: time forward (backward for `when=past`), names A–Z, figures highest first.',
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
    description: 'A page of shows.',
    schema: toOpenApiSchema(AdminShowListSchema),
  })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  list(
    @Query(new ZodValidationPipe(AdminShowListQuerySchema)) query: AdminShowListQuery,
  ): Promise<AdminShowList> {
    return this.shows.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One show for the admin panel — ADMIN only',
    description:
      'The show with seats and prices per category, booking counts and the latest bookings (buyer, seats, amount, status), whether it can still be changed or deleted and why not (`constraints`), and its recorded changes (`history`). The live seat map is GET /shows/:id/seats.',
  })
  @ApiParam({ name: 'id', description: 'Show id' })
  @ApiResponse({
    status: 200,
    description: 'The show.',
    schema: toOpenApiSchema(AdminShowDetailSchema),
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No show with this id.', schema: ERROR_SCHEMA })
  detail(@Param('id') id: string): Promise<AdminShowDetail> {
    return this.shows.detail(id);
  }
}
