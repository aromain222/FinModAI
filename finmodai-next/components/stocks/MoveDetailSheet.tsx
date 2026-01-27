/**
 * Move Detail Sheet Component
 * 
 * Mobile-friendly detail drawer/sheet for move explanations
 */

'use client';

import { Sheet, SheetHeader, SheetTitle, SheetContent } from '@/components/ui/sheet';
import { MoveDetail } from './StockMoveExplainer';
import type { MoveWithCatalysts } from '@/lib/analytics/moveExplainer/types';

interface MoveDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moveWithCatalysts: MoveWithCatalysts | null;
}

export function MoveDetailSheet({ open, onOpenChange, moveWithCatalysts }: MoveDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right" className="w-full max-w-2xl">
      <SheetHeader onClose={() => onOpenChange(false)}>
        <SheetTitle>Move Details</SheetTitle>
      </SheetHeader>
      <SheetContent>
        <div className="pt-4">
          <MoveDetail moveWithCatalysts={moveWithCatalysts} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

