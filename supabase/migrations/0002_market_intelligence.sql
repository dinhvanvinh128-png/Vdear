-- =============================================================================
-- VDEAR — market intelligence schema (spec: DATABASE)
--
-- OPTIONAL BY DESIGN. Every engine computes on demand from REST + cache and
-- works with no database at all. This schema exists to unlock HISTORY: score
-- series, breadth over time, flow over 7d/30d, and alert de-duplication across
-- restarts. Nothing here is on the critical path for rendering the dashboard.
--
-- Run in Supabase -> SQL Editor, or `psql $DATABASE_URL -f` this file.
-- Safe to re-run: everything is IF NOT EXISTS.
--
-- The existing user tables (watchlist, portfolio_assets, price_alerts) are in
-- 0001 / schema.sql and are NOT touched here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Reference tables
-- ---------------------------------------------------------------------------

create table if not exists public.assets (
  id          bigserial primary key,
  base        text not null unique,          -- 'BTC'
  name        text,
  coingecko_id text,
  sector      text,                          -- layer1 | defi | ai | ...
  is_stable   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_assets_base on public.assets(base);
create index if not exists idx_assets_sector on public.assets(sector) where sector is not null;

create table if not exists public.exchanges (
  id         bigserial primary key,
  code       text not null unique,           -- 'binance'
  label      text not null,
  market_type text not null default 'both' check (market_type in ('spot','futures','both')),
  -- Does this venue publish the taker-buy split? Only Binance does today, and
  -- exact CVD depends on it — see lib/engines/spotFlow.ts.
  has_taker_volume boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Raw market data
--
-- Retention is enforced by prune_market_data() below. Realtime rows are kept
-- for hours, low timeframes for days, high timeframes indefinitely — the spec's
-- "Không lưu dữ liệu dư thừa vô hạn".
-- ---------------------------------------------------------------------------

create table if not exists public.candles (
  exchange    text not null,
  symbol      text not null,
  market      text not null check (market in ('spot','futures')),
  timeframe   text not null,                 -- 1m | 5m | 15m | 1h | 4h | 1d
  open_time   timestamptz not null,
  open        numeric not null,
  high        numeric not null,
  low         numeric not null,
  close       numeric not null,
  volume      numeric not null,
  quote_volume numeric,
  -- NULL where the venue does not publish it. Never write a guessed 50/50 split.
  taker_buy_quote numeric,
  trade_count integer,
  primary key (exchange, symbol, market, timeframe, open_time)
);
create index if not exists idx_candles_lookup
  on public.candles(symbol, timeframe, open_time desc);

create table if not exists public.trades (
  id         bigserial primary key,
  exchange   text not null,
  symbol     text not null,
  market     text not null check (market in ('spot','futures')),
  price      numeric not null,
  size       numeric not null,
  usd_value  numeric not null,
  side       text not null check (side in ('buy','sell')),
  traded_at  timestamptz not null
);
create index if not exists idx_trades_symbol_time on public.trades(symbol, traded_at desc);
-- Whale queries hit this constantly; a partial index keeps it small.
create index if not exists idx_trades_whale
  on public.trades(symbol, traded_at desc) where usd_value >= 100000;

create table if not exists public.orderbook_snapshots (
  id            bigserial primary key,
  exchange      text not null,
  symbol        text not null,
  market        text not null,
  mid_price     numeric not null,
  best_bid      numeric,
  best_ask      numeric,
  spread_pct    numeric,
  -- Banded depth in QUOTE currency, matching lib/engines/orderBook.ts.
  bid_depth_025 numeric, ask_depth_025 numeric,
  bid_depth_050 numeric, ask_depth_050 numeric,
  bid_depth_100 numeric, ask_depth_100 numeric,
  bid_depth_200 numeric, ask_depth_200 numeric,
  captured_at   timestamptz not null default now()
);
create index if not exists idx_ob_symbol_time
  on public.orderbook_snapshots(symbol, captured_at desc);

-- ---------------------------------------------------------------------------
-- Computed flow
-- ---------------------------------------------------------------------------

create table if not exists public.spot_flow (
  symbol        text not null,
  timeframe     text not null,
  bucket_time   timestamptz not null,
  buy_volume    numeric not null,
  sell_volume   numeric not null,
  delta         numeric not null,
  buy_pressure  numeric,                     -- 0..1, NULL when nothing traded
  vwap          numeric,
  volume_z      numeric,
  volume_label  text,                        -- spike | expansion | normal | ...
  -- Venues that supplied a real taker split, and those excluded for lacking one.
  sources       text[] not null default '{}',
  excluded      text[] not null default '{}',
  primary key (symbol, timeframe, bucket_time)
);

create table if not exists public.cvd (
  symbol      text not null,
  timeframe   text not null,
  bucket_time timestamptz not null,
  cumulative  numeric not null,
  delta       numeric not null,
  close_price numeric,
  primary key (symbol, timeframe, bucket_time)
);
create index if not exists idx_cvd_lookup on public.cvd(symbol, timeframe, bucket_time desc);

create table if not exists public.volume_delta (
  symbol      text not null,
  timeframe   text not null,
  bucket_time timestamptz not null,
  delta       numeric not null,
  total_volume numeric not null,
  primary key (symbol, timeframe, bucket_time)
);

-- ---------------------------------------------------------------------------
-- Market-wide metrics
-- ---------------------------------------------------------------------------

create table if not exists public.market_breadth (
  captured_at        timestamptz primary key default now(),
  universe           integer not null,
  advancing_pct      numeric,
  declining_pct      numeric,
  above_ema20_pct    numeric,
  above_ema50_pct    numeric,
  above_ema200_pct   numeric,
  -- Sample sizes matter: an asset without 200 days is excluded from that ratio
  -- rather than counted as "below" (lib/engines/breadth.ts).
  ema20_sample       integer,
  ema50_sample       integer,
  ema200_sample      integer,
  new_highs          integer,
  new_lows           integer,
  advance_decline    integer,
  advancing_volume   numeric,
  declining_volume   numeric,
  volume_ratio       numeric,
  score              numeric not null
);

create table if not exists public.stablecoin_metrics (
  captured_at   timestamptz primary key default now(),
  total_usd     numeric not null,
  change_1d     numeric,
  change_7d     numeric,
  change_30d    numeric,
  direction     text,                        -- expansion | contraction | stable
  top_asset_share numeric,
  by_chain      jsonb,
  score         numeric not null
);

create table if not exists public.defi_metrics (
  captured_at      timestamptz primary key default now(),
  tvl_usd          numeric,
  tvl_change_1d    numeric,
  tvl_change_7d    numeric,
  tvl_change_30d   numeric,
  dex_volume_24h   numeric,
  dex_volume_change_1d numeric,
  pool_liquidity_usd numeric,
  dex_buy_ratio    numeric,
  top_chains       jsonb,
  score            numeric not null
);

create table if not exists public.onchain_metrics (
  asset       text not null,
  metric      text not null,                 -- activeAddresses | txCount | ...
  observed_at timestamptz not null,
  value       numeric not null,
  z_score     numeric,
  -- WHICH provider answered — the on-chain resolver walks a fallback chain.
  source      text not null,
  primary key (asset, metric, observed_at)
);
create index if not exists idx_onchain_lookup
  on public.onchain_metrics(asset, metric, observed_at desc);

-- ---------------------------------------------------------------------------
-- Whale + flow
-- ---------------------------------------------------------------------------

create table if not exists public.whale_transactions (
  id          bigserial primary key,
  asset       text not null,
  -- 'cex_fill' is a real executed trade (free, always available).
  -- 'chain_transfer' requires a labelled-address provider; see lib/engines/whale.ts.
  kind        text not null check (kind in ('cex_fill','chain_transfer')),
  usd_value   numeric not null,
  side        text check (side in ('buy','sell')),
  -- Only meaningful for chain_transfer, and only with a provider that labels
  -- addresses. NULL is honest; do not infer it from a CEX fill.
  direction   text check (direction in ('exchange_to_wallet','wallet_to_exchange','wallet_to_wallet')),
  exchange    text,
  tx_hash     text,
  source      text not null,
  occurred_at timestamptz not null
);
create index if not exists idx_whale_asset_time
  on public.whale_transactions(asset, occurred_at desc);
create index if not exists idx_whale_size
  on public.whale_transactions(usd_value desc, occurred_at desc);

create table if not exists public.exchange_flows (
  asset       text not null,
  exchange    text not null default 'all',
  observed_at timestamptz not null,
  inflow      numeric,
  outflow     numeric,
  netflow     numeric,
  reserve     numeric,
  source      text not null,
  primary key (asset, exchange, observed_at)
);

create table if not exists public.derivatives_metrics (
  symbol           text not null,
  observed_at      timestamptz not null,
  funding_rate     numeric,
  funding_annualized_pct numeric,
  open_interest_usd numeric,
  oi_change_24h_pct numeric,
  long_pct         numeric,
  long_liquidations_usd numeric,
  short_liquidations_usd numeric,
  regime           text,
  score            numeric,
  primary key (symbol, observed_at)
);

-- ---------------------------------------------------------------------------
-- Scores, alerts, health
-- ---------------------------------------------------------------------------

create table if not exists public.market_scores (
  id             bigserial primary key,
  symbol         text not null,              -- 'BTC', or 'GLOBAL' for market-wide
  scored_at      timestamptz not null default now(),
  money_flow     numeric,
  trend          numeric,
  liquidity      numeric,
  breadth        numeric,
  onchain        numeric,
  whale          numeric,
  spot_flow      numeric,
  stablecoin     numeric,
  defi           numeric,
  derivatives    numeric,
  regime         text,
  regime_conviction numeric,
  acc_dist       text,
  signal_state   text,
  signal_confidence numeric,
  -- Coverage and confidence are stored alongside the score on purpose: a score
  -- without them is not interpretable (see lib/scoring/moneyFlow.ts).
  coverage       numeric,
  data_confidence numeric,
  components     jsonb,
  unique (symbol, scored_at)
);
create index if not exists idx_scores_symbol_time
  on public.market_scores(symbol, scored_at desc);

create table if not exists public.alerts (
  id          bigserial primary key,
  asset       text not null,
  kind        text not null,
  severity    text not null check (severity in ('info','warning','critical')),
  reason      text not null,
  source      text not null,
  confidence  numeric,
  payload     jsonb,
  triggered_at timestamptz not null default now(),
  -- De-duplication key so a restart does not re-fire the same alert.
  dedupe_key  text not null,
  unique (dedupe_key)
);
create index if not exists idx_alerts_time on public.alerts(triggered_at desc);
create index if not exists idx_alerts_asset on public.alerts(asset, triggered_at desc);

create table if not exists public.api_health (
  id          bigserial primary key,
  source      text not null,
  status      text not null,                 -- online | degraded | error | not_configured
  latency_ms  integer,
  message     text,
  checked_at  timestamptz not null default now()
);
create index if not exists idx_health_source_time on public.api_health(source, checked_at desc);

create table if not exists public.data_quality (
  id            bigserial primary key,
  symbol        text not null,
  severity      text not null,               -- none | minor | major | critical
  median_price  numeric,
  raw_spread_pct numeric,
  outliers      text[],
  message       text,
  deviations    jsonb,
  detected_at   timestamptz not null default now()
);
create index if not exists idx_quality_time on public.data_quality(detected_at desc);
create index if not exists idx_quality_symbol on public.data_quality(symbol, detected_at desc);

-- ---------------------------------------------------------------------------
-- Retention (spec: "Realtime -> ngắn, 1m/5m -> trung hạn, 1H/4H/1D -> dài hạn")
-- ---------------------------------------------------------------------------

create table if not exists public.retention_policy (
  table_name  text not null,
  timeframe   text,                          -- NULL = applies to the whole table
  keep_hours  integer not null,              -- NULL keep_hours is not allowed; use a large value
  primary key (table_name, timeframe)
);

insert into public.retention_policy (table_name, timeframe, keep_hours) values
  ('trades',              null,  24),        -- raw fills: hours
  ('orderbook_snapshots', null,  48),
  ('candles',             '1m',  168),       -- 7 days
  ('candles',             '5m',  168),
  ('candles',             '15m', 2160),      -- 90 days
  ('candles',             '1h',  2160),
  ('candles',             '4h',  87600),     -- 10 years, effectively kept
  ('candles',             '1d',  87600),
  ('spot_flow',           '5m',  168),
  ('spot_flow',           '15m', 2160),
  ('spot_flow',           '1h',  2160),
  ('spot_flow',           '4h',  87600),
  ('spot_flow',           '1d',  87600),
  ('cvd',                 '5m',  168),
  ('cvd',                 '15m', 2160),
  ('cvd',                 '1h',  2160),
  ('cvd',                 '4h',  87600),
  ('cvd',                 '1d',  87600),
  ('volume_delta',        null,  2160),
  ('api_health',          null,  168),
  ('data_quality',        null,  2160),
  ('market_scores',       null,  87600),     -- score history is the point
  ('market_breadth',      null,  87600),
  ('stablecoin_metrics',  null,  87600),
  ('defi_metrics',        null,  87600),
  ('onchain_metrics',     null,  87600),
  ('whale_transactions',  null,  2160),
  ('exchange_flows',      null,  87600),
  ('derivatives_metrics', null,  2160),
  ('alerts',              null,  8760)       -- 1 year
on conflict (table_name, timeframe) do nothing;

/*
 * Delete rows past their retention window. Called by the prune cron
 * (app/api/cron/prune). Returns a row per table with how many were removed.
 *
 * Written against the policy table rather than hard-coded so retention is
 * configurable without a code deploy.
 */
create or replace function public.prune_market_data()
returns table (pruned_table text, pruned_timeframe text, removed bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  policy record;
  time_column text;
  sql text;
  deleted bigint;
begin
  for policy in select * from public.retention_policy loop
    time_column := case policy.table_name
      when 'trades'              then 'traded_at'
      when 'orderbook_snapshots' then 'captured_at'
      when 'candles'             then 'open_time'
      when 'spot_flow'           then 'bucket_time'
      when 'cvd'                 then 'bucket_time'
      when 'volume_delta'        then 'bucket_time'
      when 'market_breadth'      then 'captured_at'
      when 'stablecoin_metrics'  then 'captured_at'
      when 'defi_metrics'        then 'captured_at'
      when 'onchain_metrics'     then 'observed_at'
      when 'whale_transactions'  then 'occurred_at'
      when 'exchange_flows'      then 'observed_at'
      when 'derivatives_metrics' then 'observed_at'
      when 'market_scores'       then 'scored_at'
      when 'alerts'              then 'triggered_at'
      when 'api_health'          then 'checked_at'
      when 'data_quality'        then 'detected_at'
      else null
    end;

    continue when time_column is null;

    sql := format('delete from public.%I where %I < now() - interval ''%s hours''',
                  policy.table_name, time_column, policy.keep_hours);
    if policy.timeframe is not null then
      sql := sql || format(' and timeframe = %L', policy.timeframe);
    end if;

    execute sql;
    get diagnostics deleted = row_count;

    pruned_table := policy.table_name;
    pruned_timeframe := policy.timeframe;
    removed := deleted;
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Market data is public information: anyone may READ it. Only the service role
-- may write, and writes only ever come from the cron routes, which run
-- server-side with the service-role key.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'assets','exchanges','candles','trades','orderbook_snapshots','spot_flow','cvd',
    'volume_delta','market_breadth','stablecoin_metrics','defi_metrics','onchain_metrics',
    'whale_transactions','exchange_flows','derivatives_metrics','market_scores','alerts',
    'api_health','data_quality','retention_policy'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format(
      'create policy %I on public.%I for select using (true)', t || '_public_read', t);
  end loop;
end $$;
