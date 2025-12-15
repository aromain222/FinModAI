import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type BackButtonProps = {
  href?: string;
  label?: string;
};

export function BackButton({ href = '/dashboard', label = 'Back to Dashboard' }: BackButtonProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-secondary"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}

