import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@ApiTags('system')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @ApiOperation({ summary: 'Service health check', description: 'Verifies the API process and the SQLite connection.' })
  @ApiResponse({ status: 200, description: 'Always 200; payload status is "ok" or "degraded" when SQLite is unreachable.' })
  @Get('health')
  async health(): Promise<{ status: string; service: string; db: string; uptimeSec: number }> {
    let db = 'unreachable';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'ok';
    } catch {
      // reported below
    }
    return { status: db === 'ok' ? 'ok' : 'degraded', service: 'cineseat-api', db, uptimeSec: process.uptime() };
  }
}
