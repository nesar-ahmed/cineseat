import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Screen } from './screen.entity';

@Entity('theaters')
@Index('theaters_city_idx', ['city'])
export class Theater {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  city: string;

  @Column('text')
  address: string;

  /** What the venue offers ("Recliner row", "Food court", …), shown on cinema cards. */
  @Column('simple-json', { default: '[]' })
  amenities: string[];

  @OneToMany(() => Screen, (screen) => screen.theater)
  screens: Relation<Screen[]>;
}
