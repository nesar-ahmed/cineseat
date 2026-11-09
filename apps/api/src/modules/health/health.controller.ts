import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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
