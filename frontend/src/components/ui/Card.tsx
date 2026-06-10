import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Use the warm parchment surface (for readable story content). */
  parchment?: boolean;
}

export function Card({ className, parchment = false, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[2rem] p-6 shadow-[var(--shadow-soft)]',
        parchment
          ? 'bg-parchment text-ink border border-black/5'
          : 'glass text-parchment',
        className
      )}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-display text-xl', className)} {...rest} />;
}
