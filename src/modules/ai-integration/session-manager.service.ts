import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CachedSession {
  csSessionId: string;
  chatId: string;
  sessionStatus: string;   // 'open' | 'closed' | 'transfer'
  priority: string;
  queue: string;
  humanAttendance: boolean; // true = locked, attendant is handling
  lastActivityAt: number;   // Date.now()
  clientName?: string;
  cpfLast4?: string;
}

/**
 * In-memory session cache with TTL.
 *
 * Tracks per-chat session state so the hook can decide:
 * - Route to AI (sessionStatus='open', humanAttendance=false)
 * - Route to human queue (sessionStatus='closed'|'transfer', humanAttendance=true)
 * - Expire stale sessions (TTL exceeded)
 *
 * On restart, cache is empty — next message creates a fresh CS session.
 * Tickets in the database survive restarts.
 */
@Injectable()
export class SessionManagerService {
  private readonly logger = new Logger(SessionManagerService.name);
  private readonly cache = new Map<string, CachedSession>();
  private readonly ttlMs: number;

  /** Cleanup timer reference */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly configService: ConfigService) {
    this.ttlMs =
      (parseInt(configService.get<string>('AI_SESSION_TTL_SECONDS', '3600'), 10) || 3600) * 1000;
  }

  onModuleInit(): void {
    // Purge expired entries every 5 minutes
    this.cleanupTimer = setInterval(() => this.purgeExpired(), 5 * 60 * 1000);
    this.logger.log(`SessionManager initialized — TTL: ${this.ttlMs / 1000}s`);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────

  /** Get cached session by WhatsApp chatId. Returns null if not found or expired. */
  getByChatId(chatId: string): CachedSession | null {
    const session = this.cache.get(chatId);
    if (!session) {
      this.logger.debug(`Cache MISS for chatId=${chatId}`);
      return null;
    }
    if (this.isExpired(session)) {
      this.cache.delete(chatId);
      this.logger.debug(`Session EXPIRED for chatId=${chatId}, lastActivity=${new Date(session.lastActivityAt).toISOString()}`);
      return null;
    }
    this.logger.debug(`Cache HIT for chatId=${chatId}, csSessionId=${session.csSessionId}, age=${Math.round((Date.now()-session.lastActivityAt)/1000)}s`);
    return session;
  }

  /** Get cached session by CS sessionId. */
  getByCsSessionId(csSessionId: string): CachedSession | null {
    for (const session of this.cache.values()) {
      if (session.csSessionId === csSessionId && !this.isExpired(session)) {
        return session;
      }
    }
    return null;
  }

  /** Create or update a cached session entry. */
  upsert(params: {
    chatId: string;
    csSessionId: string;
    sessionStatus?: string;
    priority?: string;
    queue?: string;
    clientName?: string;
    cpfLast4?: string;
  }): CachedSession {
    const existing = this.cache.get(params.chatId);
    const entry: CachedSession = {
      csSessionId: params.csSessionId,
      chatId: params.chatId,
      sessionStatus: params.sessionStatus ?? existing?.sessionStatus ?? 'open',
      priority: params.priority ?? existing?.priority ?? '',
      queue: params.queue ?? existing?.queue ?? '',
      humanAttendance: existing?.humanAttendance ?? false,
      lastActivityAt: Date.now(),
      clientName: params.clientName ?? existing?.clientName,
      cpfLast4: params.cpfLast4 ?? existing?.cpfLast4,
    };
    this.cache.set(params.chatId, entry);
    this.logger.debug(`upsert: saved chatId=${params.chatId}, csSessionId=${params.csSessionId}, cacheSize=${this.cache.size}`);
    return entry;
  }

  /** Update activity timestamp (called on each message when IA is active). */
  touch(chatId: string): void {
    const session = this.cache.get(chatId);
    if (session) {
      session.lastActivityAt = Date.now();
    }
  }

  /** Lock session for human attendance (stop routing to AI). */
  lock(chatId: string): void {
    const session = this.cache.get(chatId);
    if (session) {
      session.humanAttendance = true;
      session.lastActivityAt = Date.now();
      this.logger.log(`Session locked for human attendance: chatId=${chatId}`);
    }
  }

  /** Unlock and remove from cache (attendant finished). */
  unlock(chatId: string): void {
    this.cache.delete(chatId);
    this.logger.log(`Session unlocked and removed: chatId=${chatId}`);
  }

  /** Check if a session is past its TTL. */
  isExpired(session: CachedSession): boolean {
    return Date.now() - session.lastActivityAt > this.ttlMs;
  }

  /** Remove all expired entries. */
  purgeExpired(): number {
    let removed = 0;
    for (const [chatId, session] of this.cache.entries()) {
      if (this.isExpired(session)) {
        this.cache.delete(chatId);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(`Purged ${removed} expired sessions`);
    }
    return removed;
  }

  /** Debug: get cache size. */
  get size(): number {
    return this.cache.size;
  }
}