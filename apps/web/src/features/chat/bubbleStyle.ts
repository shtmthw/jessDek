import { cn } from '@/lib/cn';

/** Rounded corners for one bubble in a run: the sender's side is tighter between neighbours. */
export const bubbleCorners = (mine: boolean, first: boolean, last: boolean) =>
  cn(
    'rounded-[20px]',
    mine ? !first && 'rounded-tr-md' : !first && 'rounded-tl-md',
    mine ? !last && 'rounded-br-md' : !last && 'rounded-bl-md',
  );
