import { redirect } from 'next/navigation';
import { legacyViewerHref } from '@/features/swim-resources/lib/domain/data-viewer';

export default async function LegacyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const athlete = Array.isArray(params.athlete) ? params.athlete[0] : params.athlete;
  redirect(legacyViewerHref('roster', athlete));
}
