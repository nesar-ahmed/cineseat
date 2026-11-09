import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // WAL so reads are not blocked by writes (guideline section 7).
    // journal_mode returns a result row, so it must go through $queryRawUnsafe.
    await this.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await this.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
    this.logger.log('Connected to SQLite (WAL mode)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
