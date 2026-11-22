import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CreateHoldSchema,
  HoldSchema,
  MAX_SEATS_PER_BOOKING,
  type CreateHoldInput,
  type Hold,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { HoldsService } from './holds.service';

/** Holding seats is cheap for the caller and blocks them for everyone else: keep it human-paced. */
const HOLD_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@ApiTags('holds')
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('holds')
export class HoldsController {
  constructor(private readonly holds: HoldsService) {}

  @Post()
  @Throttle(HOLD_THROTTLE)
  @ApiOperation({
    summary: 'Hold seats while you check out',
    description: `Reserves up to ${MAX_SEATS_PER_BOOKING} seats of one show for HOLD_MINUTES (never past the show's start). All seats are held or none is. Other people see them as HELD on the seat map; if the hold is not paid in time it is removed and the seats are on sale again. A new hold replaces your previous one, so changing seats is just holding again.`,
  })
  @ApiBody({ schema: toOpenApiSchema(CreateHoldSchema, 'input'), required: true })
  @ApiResponse({ status: 201, description: 'Your hold.', schema: toOpenApiSchema(HoldSchema) })
  @ApiResponse({
    status: 400,
    description: 'Invalid body, or seats that are not in this show.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No show with this id.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: 'A seat is held or sold already (the message names it), or the show has started.',
    schema: ERROR_SCHEMA,
  })
  place(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(CreateHoldSchema)) input: CreateHoldInput,
  ): Promise<Hold> {
    return this.holds.place(userId, input);
  }

  @Get('current')
  @ApiOperation({
    summary: 'Your seats on hold',
    description:
      'The hold you have right now, to resume checkout after a reload. There is at most one.',
  })
  @ApiResponse({ status: 200, description: 'Your hold.', schema: toOpenApiSchema(HoldSchema) })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No seats on hold.', schema: ERROR_SCHEMA })
  current(@CurrentUser('id') userId: string): Promise<Hold> {
    return this.holds.current(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of your holds, while it lasts' })
  @ApiParam({ name: 'id', description: 'Hold id' })
  @ApiResponse({ status: 200, description: 'Your hold.', schema: toOpenApiSchema(HoldSchema) })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description: 'Expired, released, or not yours.',
    schema: ERROR_SCHEMA,
  })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<Hold> {
    return this.holds.findActive(userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Release your seats',
    description: 'Gives the seats back before the hold runs out.',
  })
  @ApiParam({ name: 'id', description: 'Hold id' })
  @ApiResponse({ status: 204, description: 'Released; the seats are on sale again.' })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description: 'Expired, released already, or not yours.',
    schema: ERROR_SCHEMA,
  })
  async release(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<void> {
    await this.holds.release(userId, id);
  }
}
