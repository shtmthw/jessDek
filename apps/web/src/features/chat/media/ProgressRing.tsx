import { motion } from 'motion/react';
import { spring } from '@/lib/motion';

/**
 * A circular progress indicator for tiles. Without a value it spins a quarter arc (and pulses
 * instead when motion is reduced). 48px by default; pass a smaller `size` for corner badges.
 */
export function ProgressRing({
  value,
  size = 48,
  label,
}: {
  /** 0–1, or undefined while the length of the wait isn't known. */
  value?: number;
  size?: number;
  label: string;
}) {
  const determinate = value !== undefined;
  const stroke = size < 30 ? 5 : 3;
  return (
    <svg
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(value * 100) : undefined}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={
        determinate
          ? '-rotate-90'
          : 'animate-spin [animation-duration:1s] motion-reduce:animate-pulse'
      }
      fill="none"
      strokeWidth={stroke}
      strokeLinecap="round"
    >
      <circle cx="24" cy="24" r="21" className="stroke-white/25" />
      {determinate ? (
        <motion.circle
          cx="24"
          cy="24"
          r="21"
          className="stroke-white"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(0.02, Math.min(1, value)) }}
          transition={spring.snappy}
        />
      ) : (
        <circle
          cx="24"
          cy="24"
          r="21"
          className="stroke-white"
          pathLength={1}
          strokeDasharray="0.25 0.75"
        />
      )}
    </svg>
  );
}
