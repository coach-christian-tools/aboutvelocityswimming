import { swimResourcesPath } from '../../../../../../features/swim-resources/lib/routes.ts';
import { redirect } from 'next/navigation';

export default function AttendanceAdminPage() {
  redirect(swimResourcesPath("/admin/data/attendance"));
}
