import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-center">
      <div>
        <div className="text-6xl font-black text-brand">404</div>
        <p className="mt-2 text-sm text-muted">This page drifted off the chart.</p>
        <Link href="/" className="mt-4 inline-block"><Button variant="primary">Back to dashboard</Button></Link>
      </div>
    </div>
  );
}
