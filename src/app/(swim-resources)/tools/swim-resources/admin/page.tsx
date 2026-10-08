import { swimResourcesPath } from '../../../../../features/swim-resources/lib/routes.ts';
import { VELOCITY_TEAM_ID } from '@/features/swim-resources/lib/domain/entities';
import Link from 'next/link';
import { VIEWER_COLLECTIONS, viewerHref } from '@/features/swim-resources/lib/domain/data-viewer';

export default function AdminPage() {
  return <>
    <h1>Collections</h1>
    <p>Read-only views of stored Firestore data. Use Import to review collected changes.</p>
    <p><Link href={swimResourcesPath("/admin/maintenance")}>Review evidence maintenance</Link>: overdue checks, failures, missing evidence, disagreements and open questions.</p>
    <p><Link href={swimResourcesPath("/admin/map")}>Explore the data structure and relationships</Link> to review possible simplifications.</p>
    <p>Default team: <Link href={viewerHref(`teams/${VELOCITY_TEAM_ID}`)}>Velocity Swimming</Link>. Unassigned legacy team-specific records belong to this team.</p>
    <table><thead><tr><th>Collection</th><th>Firestore path</th></tr></thead><tbody>
      {VIEWER_COLLECTIONS.map(item => <tr key={item.id}><td><Link href={viewerHref(item.id)}>{item.label}</Link></td><td><code>{item.id}</code></td></tr>)}
    </tbody></table>
  </>;
}
