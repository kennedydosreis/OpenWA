import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_provider_configs')
export class AiProviderConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36, unique: true })
  sessionId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 2048 })
  baseUrl!: string;

  @Column({ type: 'varchar', length: 512 })
  apiKey!: string;

  @Column({ type: 'varchar', length: 255 })
  model!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  extraHeaders!: Record<string, string> | null;

  @Column({ type: 'simple-json', nullable: true })
  extraBody!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  canal!: string | null;

  @Column({ type: 'int', default: 30000 })
  timeoutMs!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}