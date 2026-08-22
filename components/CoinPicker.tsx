'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const COMMON = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'SUI', 'WLD'];

export function CoinPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [input, setInput] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-1">
      {COMMON.map((c) => (
        <Button key={c} size="sm" active={value === c} onClick={() => onChange(c)}>{c}</Button>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const b = input.trim().toUpperCase().replace(/USDT$/, '').replace(/[^A-Z0-9]/g, '');
          if (b) { onChange(b); setInput(''); }
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Other…"
          className="h-8 w-24 rounded-lg border border-border bg-panel-2 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand/40"
        />
      </form>
    </div>
  );
}
