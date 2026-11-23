import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

export const Skeleton = ({ className, style }: { className?: string; style?: CSSProperties }) => (
  <div aria-hidden className={cn('skeleton rounded-lg', className)} style={style} />
);
