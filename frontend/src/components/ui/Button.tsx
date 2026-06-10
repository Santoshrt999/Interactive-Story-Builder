import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'magic';
type Size = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-firefly text-night-900 hover:brightness-105 shadow-[0_12px_30px_-10px_rgba(255,209,102,0.7)]',
  secondary: 'glass text-parchment hover:bg-white/10',
  ghost: 'bg-transparent text-parchment/80 hover:text-parchment hover:bg-white/5',
  magic:
    'text-night-900 bg-gradient-to-br from-blossom via-aurora to-sky hover:brightness-110 shadow-[0_14px_36px_-12px_rgba(124,108,255,0.8)]',
};

const SIZES: Record<Size, string> = {
  sm: 'text-sm px-4 py-2 min-h-[40px]',
  md: 'text-base px-5 py-2.5 min-h-[48px]',
  lg: 'text-lg px-7 py-3.5 min-h-[56px]',
  xl: 'text-xl px-9 py-5 min-h-[68px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold',
        'transition-[transform,filter,background-color] duration-200 active:scale-[0.97]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        'select-none',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    />
  );
});
