import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie, MovieGenre, Theater } from '../database/entities';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/** Catalog: the filter vocabulary and facet counts that sit beside GET /movies. */
@Module({
  imports: [TypeOrmModule.forFeature([Movie, MovieGenre, Theater])],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
