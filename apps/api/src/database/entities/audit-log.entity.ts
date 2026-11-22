import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from './user.entity';

@Entity('audit_logs')
@Index('audit_logs_actorId_idx', ['actorId'])
@Index('audit_logs_entity_entityId_idx', ['entity', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  actorId: string;

  @Column('text')
  action: string;

  @Column('text')
  entity: string;

  @Column('text', { nullable: true })
  entityId: string | null;

  /** What the change was about, in words, as it read then ("Screen 2", a movie's title). */
  @Column('text', { nullable: true })
  subject: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.auditLogs, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'actorId', foreignKeyConstraintName: 'audit_logs_actorId_fkey' })
  actor: Relation<User>;
}
