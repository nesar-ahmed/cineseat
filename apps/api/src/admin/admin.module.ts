import { Module } from '@nestjs/common';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';

/** Read models for the admin panel (`/admin/*` in the web app). */
@Module({
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class AdminModule {}
