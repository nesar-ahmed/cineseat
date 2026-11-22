import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CatalogFacetsSchema,
  CatalogFiltersSchema,
  MovieListQuerySchema,
  type CatalogFacets,
  type CatalogFilters,
  type MovieListQuery,
} from '@cineseat/shared';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApiMovieListQuery } from '../movies/movies.controller';
import { CatalogService } from './catalog.service';

/** Discovery metadata for the movies catalog: filter vocabulary and live facet counts. */
@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('filters')
  @ApiOperation({
    summary: 'Filter vocabulary',
    description:
      'Everything a filter UI or booking widget offers: genres, languages, certificates, formats, cities, theaters, sorts and the bookable dates.',
  })
  @ApiResponse({
    status: 200,
    description: 'The vocabulary.',
    schema: toOpenApiSchema(CatalogFiltersSchema),
  })
  filters(): Promise<CatalogFilters> {
    return this.catalog.filters();
  }

  @Get('facets')
  @ApiOperation({
    summary: 'Facet counts for a movies query',
    description:
      'Takes the same parameters as GET /movies. For each option, `count` is the number of results that choosing it would give with every other filter kept (`page`, `pageSize` and `sort` are ignored).',
  })
  @ApiMovieListQuery()
  @ApiResponse({
    status: 200,
    description: 'Counts per option.',
    schema: toOpenApiSchema(CatalogFacetsSchema),
  })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid.', schema: ERROR_SCHEMA })
  facets(
    @Query(new ZodValidationPipe(MovieListQuerySchema)) query: MovieListQuery,
  ): Promise<CatalogFacets> {
    return this.catalog.facets(query);
  }
}
