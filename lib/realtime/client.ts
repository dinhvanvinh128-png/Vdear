/**
 * Browser-side multi-venue subscription.
 *
 * Reconnects with exponential backoff and full jitter — the same policy as the
 * REST layer, and for the same reason: without jitter every viewer's tab
 * reconnects in lockstep after a venue blip and recreates the outage.
 *
 * A venue that keeps failing is dropped rather than retried forever; its status
 * is reported so the UI can show which venues are actually live instead of
 * implying full coverage.
 */
import type { ExchangeId } from '@/lib/types';
import type {
  RealtimeChannel, RealtimeHandlers, RealtimeStatus,
} from '@/lib/realtime/types';
import { VENUE_STREAMS } from '@/lib/realtime/venues';

export interface SubscribeOptions {
  symbol: string;
  channel: RealtimeChannel;
  exchanges?: ExchangeId[];
  handlers: RealtimeHandlers;
  /** Give up on a venue after this many consecutive failures. Default 5. */
  maxRetries?: number;
  /** Override the WebSocket constructor (tests). */
  socketFactory?: (url: string) => WebSocketLike;
}

/** The slice of the WebSocket API this client uses — keeps it testable. */
export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((this: unknown, ev: unknown) => void) | null;
  onmessage: ((this: unknown, ev: { data: unknown }) => void) | null;
  onerror: ((this: unknown, ev: unknown) => void) | null;
  onclose: ((this: unknown, ev: unknown) => void) | null;
}

export interface Subscription {
  close(): void;
  status(): Record<string, RealtimeStatus>;
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;

export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

/**
 * Subscribe to one symbol across venues.
 *
 * If WS_RELAY_URL is set, a single relay connection replaces the per-venue ones
 * and the browser talks only to our own backend — the hook left for a future
 * always-on worker (see lib/realtime/types.ts).
 */
export function subscribe(opts: SubscribeOptions): Subscription {
  const {
    symbol, channel, handlers, maxRetries = 5,
    socketFactory = (url: string) => new WebSocket(url) as unknown as WebSocketLike,
  } = opts;

  const wanted = opts.exchanges
    ? VENUE_STREAMS.filter((v) => opts.exchanges!.includes(v.exchange))
    : VENUE_STREAMS;

  const statuses: Record<string, RealtimeStatus> = {};
  const sockets: WebSocketLike[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  const intervals: ReturnType<typeof setInterval>[] = [];
  let closed = false;

  const setStatus = (exchange: ExchangeId, status: RealtimeStatus) => {
    statuses[exchange] = status;
    handlers.onStatus?.(exchange, status);
  };

  for (const venue of wanted) {
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      setStatus(venue.exchange, 'connecting');

      let socket: WebSocketLike;
      try {
        socket = socketFactory(venue.url);
      } catch {
        setStatus(venue.exchange, 'error');
        scheduleRetry();
        return;
      }
      sockets.push(socket);

      socket.onopen = () => {
        attempt = 0;
        setStatus(venue.exchange, 'open');
        const frame = venue.subscribeFrame(symbol, channel);
        if (frame) socket.send(frame);
        if (venue.pingFrame && venue.pingIntervalMs) {
          intervals.push(setInterval(() => {
            try { socket.send(venue.pingFrame!); } catch { /* the close handler deals with it */ }
          }, venue.pingIntervalMs));
        }
      };

      socket.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        // One venue's malformed frame must not break the others.
        try {
          for (const event of venue.parse(ev.data, symbol)) handlers.onEvent(event);
        } catch { /* ignore a bad frame */ }
      };

      socket.onerror = () => setStatus(venue.exchange, 'error');

      socket.onclose = () => {
        if (closed) return;
        setStatus(venue.exchange, 'closed');
        scheduleRetry();
      };
    };

    const scheduleRetry = () => {
      if (closed) return;
      if (attempt >= maxRetries) {
        // Stop pretending this venue is coming back; the UI shows it as down.
        setStatus(venue.exchange, 'unsupported');
        return;
      }
      const delay = backoffDelay(attempt++);
      timers.push(setTimeout(connect, delay));
    };

    connect();
  }

  return {
    close() {
      closed = true;
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      sockets.forEach((s) => { try { s.close(); } catch { /* already closed */ } });
    },
    status() {
      return { ...statuses };
    },
  };
}
