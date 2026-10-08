import { swimResourcesPath } from '../lib/routes.ts';
import Link from 'next/link';

interface UnderConstructionProps {
  showHomeLink?: boolean;
  title?: string;
  description?: string;
  className?: string;
}

export default function UnderConstruction({
  showHomeLink = true,
  title = 'Under Construction',
  description = 'This page is currently being built. Check back soon for updates!',
  className = 'min-h-[70vh]',
}: UnderConstructionProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-6 text-center ${className}`}>
      <h1 className="text-2xl font-bold text-text-primary mb-3 text-center">{title}</h1>
      <p className="text-sm text-text-secondary mb-6 text-center max-w-[400px]">
        {description}
      </p>
      {showHomeLink && (
        <Link href={swimResourcesPath("/")} className="flex items-center gap-2 bg-surface border border-border rounded-full px-5 py-2 text-sm font-medium text-text-primary transition-all duration-200 hover:bg-hover-bg hover:shadow-xs">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Home
        </Link>
      )}
    </div>
  );
}
