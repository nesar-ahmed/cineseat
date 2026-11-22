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
import { z } from 'zod';
import {
  CreateScreenSchema,
  CreateTheaterSchema,
  ScreenLayoutSchema,
  TheaterDetailSchema,
  TheaterListQuerySchema,
  TheaterSchema,
  UpdateScreenSchema,
  UpdateTheaterSchema,
  type CreateScreenInput,
  type CreateTheaterInput,
  type ScreenLayout,
  type Theater,
  type TheaterDetail,
  type TheaterListQuery,
  type UpdateScreenInput,
  type UpdateTheaterInput,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TheatersService } from './theaters.service';

/** ADMIN-only route: JWT + role guard + the cookie scheme in Swagger. */
const AdminOnly = (): MethodDecorator => (target, key, descriptor) => {
  UseGuards(JwtAuthGuard, RolesGuard)(target, key, descriptor);
  Roles('ADMIN')(target, key, descriptor);
  ApiCookieAuth(AUTH_COOKIE_SCHEME)(target, key, descriptor);
  ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })(
    target,
    key,
    descriptor,
  );
  ApiResponse({ status: 403, description: 'Signed in as USER.', schema: ERROR_SCHEMA })(
    target,
    key,
    descriptor,
  );
};

@ApiTags('theaters')
@Controller('theaters')
export class TheatersController {
  constructor(private readonly theaters: TheatersService) {}

  @Get()
  @ApiOperation({
    summary: 'Cinemas',
    description: "With screen and seat counts, amenities and today's shows (cinema time zone).",
  })
  @ApiQuery({ name: 'city', required: false, schema: { type: 'string' } })
  @ApiResponse({
    status: 200,
    description: 'Cinemas by city and name.',
    schema: toOpenApiSchema(z.array(TheaterSchema)),
  })
  list(
    @Query(new ZodValidationPipe(TheaterListQuerySchema)) query: TheaterListQuery,
  ): Promise<Theater[]> {
    return this.theaters.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One cinema with its screens' })
  @ApiParam({ name: 'id', description: 'Theater id' })
  @ApiResponse({
    status: 200,
    description: 'The cinema.',
    schema: toOpenApiSchema(TheaterDetailSchema),
  })
  @ApiResponse({ status: 404, description: 'No theater with this id.', schema: ERROR_SCHEMA })
  findOne(@Param('id') id: string): Promise<TheaterDetail> {
    return this.theaters.findOne(id);
  }

  @Post()
  @AdminOnly()
  @ApiOperation({
    summary: 'Add a cinema — ADMIN only',
    description:
      'Names are unique (ignoring case); a city takes the spelling other cinemas use ("dhaka" → "Dhaka"). Recorded in the audit log.',
  })
  @ApiBody({ schema: toOpenApiSchema(CreateTheaterSchema, 'input'), required: true })
  @ApiResponse({
    status: 201,
    description: 'The new cinema.',
    schema: toOpenApiSchema(TheaterDetailSchema),
  })
  @ApiResponse({ status: 400, description: 'A field is missing or invalid.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 409, description: 'The name is taken.', schema: ERROR_SCHEMA })
  create(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(CreateTheaterSchema)) input: CreateTheaterInput,
  ): Promise<TheaterDetail> {
    return this.theaters.create(input, adminId);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({
    summary: 'Edit a cinema — ADMIN only',
    description:
      'Only the fields sent change, and only those that differ are written and audited. Same name and city rules as adding one.',
  })
  @ApiParam({ name: 'id', description: 'Theater id' })
  @ApiBody({ schema: toOpenApiSchema(UpdateTheaterSchema, 'input'), required: true })
  @ApiResponse({
    status: 200,
    description: 'The cinema after the change.',
    schema: toOpenApiSchema(TheaterDetailSchema),
  })
  @ApiResponse({ status: 404, description: 'No theater with this id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 409, description: 'The name is taken.', schema: ERROR_SCHEMA })
  update(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTheaterSchema)) input: UpdateTheaterInput,
  ): Promise<TheaterDetail> {
    return this.theaters.update(id, input, adminId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminOnly()
  @ApiOperation({
    summary: 'Delete a cinema — ADMIN only',
    description:
      'Refused while any of its screens has shows (past or upcoming): they carry bookings and sales. Recorded in the audit log.',
  })
  @ApiParam({ name: 'id', description: 'Theater id' })
  @ApiResponse({ status: 204, description: 'Deleted with its screens and seats.' })
  @ApiResponse({ status: 404, description: 'No theater with this id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 409, description: 'The cinema has shows.', schema: ERROR_SCHEMA })
  async remove(@CurrentUser('id') adminId: string, @Param('id') id: string): Promise<void> {
    await this.theaters.remove(id, adminId);
  }

  @Post(':id/screens')
  @AdminOnly()
  @ApiOperation({
    summary: 'Add a screen — ADMIN only',
    description:
      'Seats are generated from the layout: rows A… from the front, the back rows recliners, the rows in front of them premium. Recorded in the theater’s audit log.',
  })
  @ApiParam({ name: 'id', description: 'Theater id' })
  @ApiBody({ schema: toOpenApiSchema(CreateScreenSchema, 'input'), required: true })
  @ApiResponse({
    status: 201,
    description: 'The screen with its seats.',
    schema: toOpenApiSchema(ScreenLayoutSchema),
  })
  @ApiResponse({ status: 404, description: 'No theater with this id.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'A screen with this name exists in the theater.',
    schema: ERROR_SCHEMA,
  })
  createScreen(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateScreenSchema)) input: CreateScreenInput,
  ): Promise<ScreenLayout> {
    return this.theaters.createScreen(id, input, adminId);
  }
}

@ApiTags('theaters')
@Controller('screens')
export class ScreensController {
  constructor(private readonly theaters: TheatersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'One screen with its seat layout' })
  @ApiParam({ name: 'id', description: 'Screen id' })
  @ApiResponse({
    status: 200,
    description: 'The screen.',
    schema: toOpenApiSchema(ScreenLayoutSchema),
  })
  @ApiResponse({ status: 404, description: 'No screen with this id.', schema: ERROR_SCHEMA })
  findOne(@Param('id') id: string): Promise<ScreenLayout> {
    return this.theaters.findScreen(id);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({
    summary: 'Edit a screen — ADMIN only',
    description:
      'Rename or change formats any time (not dropping one upcoming shows use). A new layout needs all four layout fields and a screen without shows. Only what differs is written and recorded in the theater’s audit log; refusals name the field (`name:`, `formats:`, `rows:`).',
  })
  @ApiParam({ name: 'id', description: 'Screen id' })
  @ApiBody({ schema: toOpenApiSchema(UpdateScreenSchema, 'input'), required: true })
  @ApiResponse({
    status: 200,
    description: 'The screen after the change.',
    schema: toOpenApiSchema(ScreenLayoutSchema),
  })
  @ApiResponse({ status: 404, description: 'No screen with this id.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'Name taken, format in use, or layout locked by shows.',
    schema: ERROR_SCHEMA,
  })
  update(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateScreenSchema)) input: UpdateScreenInput,
  ): Promise<ScreenLayout> {
    return this.theaters.updateScreen(id, input, adminId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminOnly()
  @ApiOperation({
    summary: 'Delete a screen — ADMIN only',
    description: 'Refused while the screen has shows. Recorded in the theater’s audit log.',
  })
  @ApiParam({ name: 'id', description: 'Screen id' })
  @ApiResponse({ status: 204, description: 'Deleted with its seats.' })
  @ApiResponse({ status: 404, description: 'No screen with this id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 409, description: 'The screen has shows.', schema: ERROR_SCHEMA })
  async remove(@CurrentUser('id') adminId: string, @Param('id') id: string): Promise<void> {
    await this.theaters.removeScreen(id, adminId);
  }
}
