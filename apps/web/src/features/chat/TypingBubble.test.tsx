import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TypingBubble } from './TypingBubble';

const alice = { id: 'u1', name: 'Alice Moreno', color: '#6366f1' };
const bob = { id: 'u2', name: 'Bob Carter', color: '#22c55e' };
const carol = { id: 'u3', name: 'Carol Nakamura', color: '#ec4899' };
const dave = { id: 'u4', name: 'Dave Okafor', color: '#f97316' };

const faces = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-typing-face]'));

describe('TypingBubble', () => {
  it('shows the typer’s profile picture in a group', () => {
    const { container } = render(<TypingBubble typers={[alice]} group />);
    const [face] = faces(container);
    expect(face).toHaveTextContent('AM'); // their initials, on their own colour
    expect(face!.querySelector<HTMLElement>('span[style*="background"]')).toHaveStyle({
      backgroundColor: '#6366f1',
    });
    expect(face).toHaveAttribute('title', 'Alice Moreno');
    expect(container.querySelectorAll('.typing-dot')).toHaveLength(3);
  });

  it('stacks up to three faces when several people type, in the order they started', () => {
    const { container } = render(<TypingBubble typers={[alice, bob, carol, dave]} group />);
    expect(faces(container).map((f) => f.dataset.typingFace)).toEqual(['u1', 'u2', 'u3']);
  });

  it('has no faces in a one-to-one chat, where the header already says who it is', () => {
    const { container } = render(<TypingBubble typers={[alice]} group={false} />);
    expect(faces(container)).toHaveLength(0);
    expect(container.querySelectorAll('.typing-dot')).toHaveLength(3);
  });

  it('stays out of the accessibility tree (the header announces who is typing)', () => {
    const { container } = render(<TypingBubble typers={[alice]} group />);
    expect(container.querySelector('[data-typing-bubble]')).toHaveAttribute('aria-hidden', 'true');
  });
});
