/**
 * Realtime market data (spec: PERFORMANCE — WebSocket).
 *
 * ── The architectural trade-off, stated plainly ─────────────────────────────
 * The spec's diagram is Browser → Vdear Backend → Exchanges. That is right for
 * everything computed, and it is what every score in this product does.
 *
 * It is NOT achievable for raw tick streams on Vercel: serverless functions
 * cannot hold a long-lived WebSocket fan-in, so there is no process to maintain
 * venue connections and multiplex them out. The honest options were:
 *
 *   a) poll REST faster — more load on the venues, still not realtime;
 *   b) run a separate always-on worker — real infrastructure the user has not
 *      asked for and would have to pay for;
 *   c) subscribe the browser directly to PUBLIC, KEYLESS venue streams for the
 *      ONE symbol on screen.
 *
 * (c) is implemented. It is emphatically not the "browser calls 20 APIs" pattern
 * the spec warns against: it is one stream per venue for one symbol, carrying no
 * credentials, while every aggregate, score and regime still comes from the
 * backend. WS_RELAY_URL is left as the hook for (b) later — set it and the
 * client connects to a relay instead, with no other change.
 */
import type { ExchangeId, Ticker, Trade } from '@/lib/types';

export type RealtimeChannel = 'ticker' | 'trade';

export interface RealtimeTick {
  exchange: ExchangeId;
  symbol: string;
  price: number;
  timestamp: number;
}

export interface RealtimeEvent {
  channel: RealtimeChannel;
  tick?: RealtimeTick;
  trade?: Trade;
  ticker?: Partial<Ticker>;
}

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'unsupported';

export interface RealtimeHandlers {
  onEvent: (event: RealtimeEvent) => void;
  onStatus?: (exchange: ExchangeId, status: RealtimeStatus) => void;
}

export interface VenueStream {
  readonly exchange: ExchangeId;
  readonly url: string;
  /** Subscription frame for a symbol, or null when the venue encodes it in the URL. */
  subscribeFrame(symbol: string, channel: RealtimeChannel): string | null;
  /** Parse one message into VDEAR events. Returns [] for heartbeats and acks. */
  parse(raw: string, symbol: string): RealtimeEvent[];
  /** Some venues require a periodic ping frame to stay open. */
  readonly pingFrame?: string;
  readonly pingIntervalMs?: number;
}
