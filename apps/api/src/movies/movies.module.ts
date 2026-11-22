import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie, MovieGenre, Show } from '../database/entities';
import { AdminMoviesController } from './admin-movies.controller';
import { AdminMoviesService } from './admin-movies.service';
import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';
import { posterMulterOptions } from './poster.storage';

/**
 * Movies: public browse and detail; for ADMIN accounts, editing, posters, bulk
 * actions and the admin panel's read model (`/admin/movies`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Movie, MovieGenre, Show]),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        posterMulterOptions(config.getOrThrow<string>('uploadDir')),
    }),
  ],
  controllers: [MoviesController, AdminMoviesController],
  providers: [MoviesService, AdminMoviesService],
  exports: [MoviesService],
})
export class MoviesModule {}
