import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  BulkMovieActionSchema,
  BulkMovieResultSchema,
  Certificate,
  CreateMovieSchema,
  MovieListQuerySchema,
  MovieSchema,
  MovieSort,
  MovieStatus,
  PaginatedMoviesSchema,
  ShowFormat,
  UpdateMovieSchema,
  type BulkMovieActionInput,
  type BulkMovieResult,
  type CreateMovieInput,
  type Movie,
  type MovieListQuery,
  type Paginated,
  type UpdateMovieInput,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MAX_POSTER_BYTES } from './poster.storage';
import { MoviesService } from './movies.service';

/** Query parameters shared by GET /movies and GET /catalog/facets, documented once. */
export function ApiMovieListQuery(): MethodDecorator {
  const list = (name: string, description: string, values?: readonly string[]) =>
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
  const decorators = [
    ApiQuery({
      name: 'search',
      required: false,
      description: 'Matches title, director, cast or genre (case-insensitive).',
      schema: { type: 'string' },
    }),
    ApiQuery({
      name: 'status',
      required: false,
      schema: { type: 'string', enum: MovieStatus.options },
    }),
    list('genre', 'Any of these genres.'),
    list('language', 'Any of these languages.'),
    list('certificate', 'Any of these certificates.', Certificate.options),
    list('format', 'Has an upcoming show in any of these formats.', ShowFormat.options),
    ApiQuery({
      name: 'city',
      required: false,
      description: 'Has an upcoming show in this city.',
      schema: { type: 'string' },
    }),
    list('theater', 'Has an upcoming show at any of these theater ids.'),
    ApiQuery({
      name: 'date',
      required: false,
      description: 'Has a show on this day (YYYY-MM-DD, cinema time zone).',
      schema: { type: 'string', format: 'date' },
    }),
    ApiQuery({
      name: 'minRating',
      required: false,
      schema: { type: 'number', minimum: 0, maximum: 5 },
    }),
    ApiQuery({
      name: 'minDuration',
      required: false,
      description: 'Minutes.',
      schema: { type: 'integer', minimum: 1 },
    }),
    ApiQuery({
      name: 'maxDuration',
      required: false,
      description: 'Minutes.',
      schema: { type: 'integer', minimum: 1 },
    }),
    ApiQuery({
      name: 'sort',
      required: false,
      schema: { type: 'string', enum: MovieSort.options, default: 'popular' },
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
  ];
  return (target, key, descriptor) => {
    for (const decorate of decorators) decorate(target, key, descriptor);
  };
}

/**
 * Movies (guideline section 10): public browse and detail; create, edit,
 * delete and poster upload for ADMIN accounts. Where/when filters read the show
 * schedule, so they work before the shows endpoints exist.
 */
@ApiTags('movies')
@Controller('movies')
export class MoviesController {
  constructor(private readonly movies: MoviesService) {}

  @Get()
  @ApiOperation({
    summary: 'Search and browse movies',
    description:
      'Filters combine with AND; options inside one filter with OR. `city`, `theater`, `date` and `format` keep titles with an upcoming show that matches and do not apply to COMING_SOON titles.',
  })
  @ApiMovieListQuery()
  @ApiResponse({
    status: 200,
    description: 'A page of movies.',
    schema: toOpenApiSchema(PaginatedMoviesSchema),
  })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid.', schema: ERROR_SCHEMA })
  list(
    @Query(new ZodValidationPipe(MovieListQuerySchema)) query: MovieListQuery,
  ): Promise<Paginated<Movie>> {
    return this.movies.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One movie' })
  @ApiParam({ name: 'id', description: 'Movie id' })
  @ApiResponse({ status: 200, description: 'The movie.', schema: toOpenApiSchema(MovieSchema) })
  @ApiResponse({ status: 404, description: 'No movie with this id.', schema: ERROR_SCHEMA })
  findOne(@Param('id') id: string): Promise<Movie> {
    return this.movies.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiOperation({
    summary: 'Add a movie — ADMIN only',
    description:
      'Upload the poster afterwards with POST /movies/:id/poster. Recorded in the audit log.',
  })
  @ApiBody({ schema: toOpenApiSchema(CreateMovieSchema, 'input'), required: true })
  @ApiResponse({ status: 201, description: 'The new movie.', schema: toOpenApiSchema(MovieSchema) })
  @ApiResponse({ status: 400, description: 'A field is missing or invalid.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 403, description: 'Signed in as USER.', schema: ERROR_SCHEMA })
  create(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(CreateMovieSchema)) input: CreateMovieInput,
  ): Promise<Movie> {
    return this.movies.create(input, adminId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiOperation({
    summary: 'Edit a movie — ADMIN only',
    description:
      'Only the fields sent change; `genres` replaces the whole list. Fields that differ from the stored values are written and recorded in the audit log (sending the same values back is a no-op). An edit that would break the schedule is refused with 409 naming the field: removing a format that upcoming shows use, moving the release day past the first upcoming show, or a running time that would run into the next show on a screen (GET /admin/movies/:id reports these limits as `constraints`).',
  })
  @ApiParam({ name: 'id', description: 'Movie id' })
  @ApiBody({ schema: toOpenApiSchema(UpdateMovieSchema, 'input'), required: true })
  @ApiResponse({
    status: 200,
    description: 'The movie after the change.',
    schema: toOpenApiSchema(MovieSchema),
  })
  @ApiResponse({
    status: 400,
    description: 'Nothing to update, or a field is invalid.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 403, description: 'Signed in as USER.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No movie with this id.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'The change would break shows already scheduled (the message names the field).',
    schema: ERROR_SCHEMA,
  })
  update(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateMovieSchema)) input: UpdateMovieInput,
  ): Promise<Movie> {
    return this.movies.update(id, input, adminId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiOperation({
    summary: 'Delete a movie — ADMIN only',
    description:
      'Refused while the movie has shows (past or upcoming): they carry its bookings and sales history. Recorded in the audit log.',
  })
  @ApiParam({ name: 'id', description: 'Movie id' })
  @ApiResponse({
    status: 204,
    description: 'Deleted, with its genres, reviews, watchlist entries and poster file.',
  })
  @ApiResponse({ status: 403, description: 'Signed in as USER.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No movie with this id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 409, description: 'The movie still has shows.', schema: ERROR_SCHEMA })
  async remove(@CurrentUser('id') adminId: string, @Param('id') id: string): Promise<void> {
    await this.movies.remove(id, adminId);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiOperation({
    summary: 'One action on several movies — ADMIN only',
    description:
      '`status` moves every movie to NOW_SHOWING or COMING_SOON; `delete` deletes them. Each movie succeeds or fails on its own, under the same rules and audit as the single-movie routes (a movie with shows is reported in `failed`, the rest are deleted). Up to 100 ids.',
  })
  @ApiBody({ schema: toOpenApiSchema(BulkMovieActionSchema, 'input'), required: true })
  @ApiResponse({
    status: 200,
    description: 'What was done, and what could not be (with why).',
    schema: toOpenApiSchema(BulkMovieResultSchema),
  })
  @ApiResponse({ status: 400, description: 'Unknown action or invalid ids.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 403, description: 'Signed in as USER.', schema: ERROR_SCHEMA })
  bulk(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(BulkMovieActionSchema)) input: BulkMovieActionInput,
  ): Promise<BulkMovieResult> {
    return this.movies.bulk(input, adminId);
  }

  @Post(':id/poster')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload the poster — ADMIN only',
    description: `JPEG, PNG or WebP up to ${MAX_POSTER_BYTES / 1024 / 1024} MB, 2:3 portrait recommended. Replaces (and deletes) the previous poster. Recorded in the audit log.`,
  })
  @ApiParam({ name: 'id', description: 'Movie id' })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'The movie with its new `posterPath`.',
    schema: toOpenApiSchema(MovieSchema),
  })
  @ApiResponse({
    status: 400,
    description: 'Missing file, wrong type or too large.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No movie with this id.', schema: ERROR_SCHEMA })
  async uploadPoster(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<Movie> {
    if (!file) throw new BadRequestException('Send the image as the multipart field "file"');
    return this.movies.setPoster(id, file.filename, adminId);
  }

  @Delete(':id/poster')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE_SCHEME)
  @ApiOperation({
    summary: 'Remove the poster — ADMIN only',
    description:
      'Deletes the uploaded file; the site shows generated artwork instead. A no-op when there is no poster. Recorded in the audit log.',
  })
  @ApiParam({ name: 'id', description: 'Movie id' })
  @ApiResponse({
    status: 200,
    description: 'The movie, with `posterPath: null`.',
    schema: toOpenApiSchema(MovieSchema),
  })
  @ApiResponse({ status: 403, description: 'Signed in as USER.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No movie with this id.', schema: ERROR_SCHEMA })
  removePoster(@CurrentUser('id') adminId: string, @Param('id') id: string): Promise<Movie> {
    return this.movies.removePoster(id, adminId);
  }
}
