'use client';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Newspaper } from 'lucide-react';

interface NewsResp { data: { items: unknown[] }; meta: { configured: boolean; note: string } }

export default function NewsPage() {
  const { data } = useApi<NewsResp>('/api/news', 0);
  const items = data?.data.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="News" subtitle="Curated crypto headlines" />
      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Newspaper className="h-8 w-8 text-muted" />
            <div className="text-sm font-semibold">News source not configured</div>
            <p className="max-w-md text-xs text-muted">
              {data?.meta.note ?? 'Set NEWS_API_KEY and wire a licensed provider (e.g. CryptoPanic / CoinDesk).'}
              {' '}Vdearypto shows headlines, source and summary only — never full article text.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">{/* provider-driven cards render here */}</div>
      )}
    </div>
  );
}
