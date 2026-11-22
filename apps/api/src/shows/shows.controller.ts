import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  BulkResultSchema,
  BulkShowActionSchema,
  CreateShowSchema,
  ScheduleShowsResultSchema,
  ScheduleShowsSchema,
  type BulkResult,
  type BulkShowActionInput,
  type ScheduleShowsInput,
  type ScheduleShowsResult,
  MovieShowtimesQuerySchema,
  MovieShowtimesSchema,
  SeatMapSchema,
  ShowDetailSchema,
  ShowFormat,
  ShowListQuerySchema,
  ShowtimeSchema,
  UpdateShowSchema,
  type CreateShowInput,
  type MovieShowtimes,
  type MovieShowtimesQuery,
  type SeatMap,
  type ShowDetail,
  type ShowListQuery,
  type Showtime,
  type UpdateShowInput,
} from '@cineseat/shared';
import { z } from 'zod';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ShowsService } from './shows.service';

const listParam = (name: string, description: string, values?: readonly string[]) =>
  ApiQuery({
    name,
    required: false,
    description: `${description} Comma-separated or repeated.`,
    schema: {
      type: 'array',
      items: values ? { type: 'string', enum: [...values] } : { type: 'string' },
    },
    style: 'form',
    explode: false,
  });

/**
 * Showtimes: public search, detail and live seat map; ADMIN scheduling. Money is
 * in minor units (poisha); `date`/`time` are on the cinemas' clock.
 */
@ApiTags('shows')
@Controller('shows')
export class ShowsController {
  constructor(private readonly shows: ShowsService) {}

  @Get()
  @ApiOperation({
    summary: 'Search showtimes',
    description:
      'Across movies and venues — e.g. the next show for every movie on a catalog page (`movie=id1,id2`). Without `date`: from now to the end of the schedule. With `date`: that whole day, started shows included with `bookable: false`.',
  })
  @listParam('movie', 'Movie ids.')
  @listParam('theater', 'Theater ids.')
  @ApiQuery({ name: 'city', required: false, schema: { type: 'string' } })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'YYYY-MM-DD, cinema time zone.',
    schema: { type: 'string', format: 'date' },
  })
  @listParam('format', 'Formats.', ShowFormat.options)
  @listParam('language', 'Show languages.')
  @ApiResponse({
    status: 200,
    description: 'Showtimes, earliest first.',
    schema: toOpenApiSchema(z.array(ShowtimeSchema)),
  })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid.', schema: ERROR_SCHEMA })
  search(
    @Query(new ZodValidationPipe(ShowListQuerySchema)) query: ShowListQuery,
  ): Promise<Showtime[]> {
    return this.shows.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One showtime, with the movie and venue details a booking page needs' })
  @ApiParam({ name: 'id', description: 'Show id' })
  @ApiResponse({ status: 200, description: 'The show.', schema: toOpenApiSchema(ShowDetailSchema) })
  @ApiResponse({ status: 404, description: 'No show with this id.', schema: ERROR_SCHEMA })
  findOne(@Param('id') id: string): Promise<ShowDetail> {
    return this.shows.findOne(id);
  }

  @Get(':id/seats')
  @ApiOperation({
    summary: 'Live seat map',
    description:
      'Every seat with its state (expired holds read as AVAILABLE), category and price, plus the hold length and seat limit.',
  })
  @ApiParam({ name: 'id', description: 'Show id' })
  @ApiResponse({
    status: 200,
    description: 'The seat map.',
    schema: toOpenApiSchema(SeatMapSchema),
  })
  @ApiResponse({ status: 404, description: 'No show with this id.', schema: ERROR_SCHEMA })
  seatMap(@Param('id') id: string): Promise<SeatMap> {
    return this.shows.seatMap(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiOperation({
    summary: 'Schedule a show — ADMIN only',
    description: `The movie must be released in the format, the screen must support it, the show must start in the future and on or after the release day, and it must not overlap another show on the screen (including turnaround). Seats are copied from the screen. Refusals name the field (\`format:\`, \`startsAt:\`, …). Recorded in the audit log. To schedule several at once, use POST /shows/batch.`,
  })
  @ApiBody({ schema: toOpenApiSchema(CreateShowSchema, 'input'), required: true })
  @ApiResponse({
    status: 201,
    description: 'The new show.',
    schema: toOpenApiSchema(ShowDetailSchema),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid field, unknown movie/screen, wrong format or time.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 403, description: 'Signed in as USER.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'The screen is busy at that time.',
    schema: ERROR_SCHEMA,
  })
  create(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(CreateShowSchema)) input: CreateShowInput,
  ): Promise<ShowDetail> {
    return this.shows.create(input, adminId);
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiOperation({
    summary: 'Schedule a movie at several dates and times — ADMIN only',
    description:
      'One movie on one screen at every `time` of every `date` (cinema clock), up to 100 shows: "14:45 and 21:15, Friday to Sunday". Each show is checked like POST /shows, and against the others in the batch; those that fit are created, the rest come back with the reason (`results[].error`). With `dryRun: true` nothing is saved — the answer previews what would happen.',
  })
  @ApiBody({ schema: toOpenApiSchema(ScheduleShowsSchema, 'input'), required: true })
  @ApiResponse({
    status: 200,
    description: 'One result per date × time, earliest first.',
    schema: toOpenApiSchema(ScheduleShowsResultSchema),
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid field, or unknown movie or screen.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 403, description: 'Signed in as USER.', schema: ERROR_SCHEMA })
  schedule(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(ScheduleShowsSchema)) input: ScheduleShowsInput,
  ): Promise<ScheduleShowsResult> {
    return this.shows.schedule(input, adminId);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiOperation({
    summary: 'One action on several shows — ADMIN only',
    description:
      '`delete` cancels them; `price` gives them a new base price. Each show succeeds or fails on its own under the single-show rules and audit (a show with tickets is reported in `failed`). Up to 100 ids.',
  })
  @ApiBody({ schema: toOpenApiSchema(BulkShowActionSchema, 'input'), required: true })
  @ApiResponse({
    status: 200,
    description: 'What was done, and what could not be (with why).',
    schema: toOpenApiSchema(BulkResultSchema),
  })
  @ApiResponse({ status: 400, description: 'Unknown action or invalid ids.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 403, description: 'Signed in as USER.', schema: ERROR_SCHEMA })
  bulk(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(BulkShowActionSchema)) input: BulkShowActionInput,
  ): Promise<BulkResult> {
    return this.shows.bulk(input, adminId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiOperation({
    summary: 'Change a show — ADMIN only',
    description:
      'Refused once the show has started or any seat is held or sold. Only what differs is written and recorded in the audit log (the same values are a no-op).',
  })
  @ApiParam({ name: 'id', description: 'Show id' })
  @ApiBody({ schema: toOpenApiSchema(UpdateShowSchema, 'input'), required: true })
  @ApiResponse({
    status: 200,
    description: 'The show after the change.',
    schema: toOpenApiSchema(ShowDetailSchema),
  })
  @ApiResponse({ status: 400, description: 'Invalid field, format or time.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No show with this id.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'Started, has tickets, or the screen is busy.',
    schema: ERROR_SCHEMA,
  })
  update(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateShowSchema)) input: UpdateShowInput,
  ): Promise<ShowDetail> {
    return this.shows.update(id, input, adminId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiOperation({
    summary: 'Cancel a show — ADMIN only',
    description:
      'Refused while seats are held or sold, or while booking attempts are on record. Recorded in the audit log.',
  })
  @ApiParam({ name: 'id', description: 'Show id' })
  @ApiResponse({ status: 204, description: 'Deleted, with its seat map.' })
  @ApiResponse({ status: 404, description: 'No show with this id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 409, description: 'The show has tickets.', schema: ERROR_SCHEMA })
  async remove(@CurrentUser('id') adminId: string, @Param('id') id: string): Promise<void> {
    await this.shows.remove(id, adminId);
  }
}

/** The schedule of one movie, for the movie page's date strip and showtime list. */
@ApiTags('shows')
@Controller('movies')
export class MovieShowtimesController {
  constructor(private readonly shows: ShowsService) {}

  @Get(':id/showtimes')
  @ApiOperation({
    summary: "A movie's showtimes for the coming days",
    description:
      'Today (started shows included, not bookable) to the end of the schedule, with a count per day for the date strip.',
  })
  @ApiParam({ name: 'id', description: 'Movie id' })
  @ApiQuery({ name: 'city', required: false, schema: { type: 'string' } })
  @listParam('theater', 'Theater ids.')
  @listParam('format', 'Formats.', ShowFormat.options)
  @ApiResponse({
    status: 200,
    description: 'Days and showtimes.',
    schema: toOpenApiSchema(MovieShowtimesSchema),
  })
  @ApiResponse({ status: 404, description: 'No movie with this id.', schema: ERROR_SCHEMA })
  showtimes(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(MovieShowtimesQuerySchema)) query: MovieShowtimesQuery,
  ): Promise<MovieShowtimes> {
    return this.shows.movieShowtimes(id, query);
  }
}
