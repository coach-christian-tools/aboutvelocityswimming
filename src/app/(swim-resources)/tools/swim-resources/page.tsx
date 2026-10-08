import AdminLoginFooter from '@/features/swim-resources/components/AdminLoginFooter';
import FlipLogo from '@/features/swim-resources/components/FlipLogo';
import UnderConstruction from '@/features/swim-resources/components/UnderConstruction';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-bg flex flex-col justify-between">
      <nav aria-label="Website navigation" className="px-4 pt-4">
        <Link href="/tools" className="text-primary-blue hover:underline">← Back to Tools</Link>
      </nav>
      <main className="container mx-auto px-4 max-w-xl flex-1 flex flex-col items-center justify-center py-12">
        <div className="flex justify-center mb-8">
          <FlipLogo />
        </div>
        <div className="w-full bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-xs">
          <UnderConstruction 
            showHomeLink={false}
            title="Under Construction"
            description="Velocity's Data Hub is currently being built. Check back soon for updates!"
            className="p-0"
          />
        </div>
      </main>

      <AdminLoginFooter />
    </div>
  );
}
