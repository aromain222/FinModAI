/**
 * Field with Applied Default Badge
 * 
 * Wraps an input field and shows a badge if a default was applied.
 */

import { AppliedDefaultBadge } from './AppliedDefaultBadge';
import type { AppliedDefault } from '@/lib/settings/schema';

interface FieldWithDefaultBadgeProps {
  children: React.ReactNode;
  fieldPath: string;
  appliedDefaults: AppliedDefault[];
  className?: string;
}

export function FieldWithDefaultBadge({ 
  children, 
  fieldPath, 
  appliedDefaults,
  className = '' 
}: FieldWithDefaultBadgeProps) {
  const appliedDefault = appliedDefaults.find(d => d.path === fieldPath);
  
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center gap-2">
        {children}
        {appliedDefault && (
          <AppliedDefaultBadge appliedDefault={appliedDefault} />
        )}
      </div>
    </div>
  );
}
