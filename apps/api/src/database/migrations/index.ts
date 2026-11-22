import type { MigrationInterface } from 'typeorm';
import { InitialSchema1794298851817 } from './1794298851817-InitialSchema';
import { MovieCatalog1794305750228 } from './1794305750228-MovieCatalog';
import { VenueDetails1794307231368 } from './1794307231368-VenueDetails';
import { SeatHolds1794328768063 } from './1794328768063-SeatHolds';
import { Checkout1794331463664 } from './1794331463664-Checkout';
import { Notifications1794471327621 } from './1794471327621-Notifications';
import { NotificationSubject1794479940156 } from './1794479940156-NotificationSubject';
import { AuditSubject1794500000000 } from './1794500000000-AuditSubject';

/**
 * Applied in order by `npm run db:migrate`. Listed explicitly rather than globbed
 * so the app, the CLI and the tests load exactly the same set: register every
 * file that `db:migration:generate` creates here.
 */
export const MIGRATIONS: (new () => MigrationInterface)[] = [
  InitialSchema1794298851817,
  MovieCatalog1794305750228,
  VenueDetails1794307231368,
  SeatHolds1794328768063,
  Checkout1794331463664,
  Notifications1794471327621,
  NotificationSubject1794479940156,
  AuditSubject1794500000000,
];
