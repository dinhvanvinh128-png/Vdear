/**
 * Calculation engines — pure functions over normalized data.
 *
 * Every engine takes already-fetched, already-normalized inputs and returns a
 * result plus provenance. None of them perform I/O, which is what makes the
 * whole scoring path unit-testable offline.
 */
export * from '@/lib/engines/spotFlow';
export * from '@/lib/engines/orderBook';
export * from '@/lib/engines/breadth';
export * from '@/lib/engines/stablecoin';
export * from '@/lib/engines/defi';
export * from '@/lib/engines/onchain';
export * from '@/lib/engines/whale';
export * from '@/lib/engines/derivatives';
export * from '@/lib/engines/sector';
