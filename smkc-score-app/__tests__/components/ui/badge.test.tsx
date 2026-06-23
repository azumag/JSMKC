/**
 * @jest-environment jsdom
 */

/**
 * @module Badge Component Tests
 *
 * Smoke tests for the Badge component variants.
 * Covers:
 * - default, secondary, destructive, outline: standard shadcn variants
 * - flag-active, flag-draft, flag-completed: JSMKC status variants
 * - asChild: renders the Slot child instead of a <span>
 * - custom className passthrough
 */
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('TC-2776: renders children', () => {
    render(<Badge>Hello</Badge>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('TC-2777: renders with default variant classes', () => {
    render(<Badge data-testid="badge">Default</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('bg-primary', 'text-primary-foreground');
  });

  it('TC-2778: renders secondary variant', () => {
    render(<Badge variant="secondary" data-testid="badge">Secondary</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('bg-secondary', 'text-secondary-foreground');
  });

  it('TC-2779: renders destructive variant', () => {
    render(<Badge variant="destructive" data-testid="badge">Error</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('bg-destructive', 'text-white');
  });

  it('TC-2780: renders outline variant', () => {
    render(<Badge variant="outline" data-testid="badge">Outline</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('border-foreground/70', 'bg-transparent');
  });

  it('TC-2781: renders flag-active variant', () => {
    render(<Badge variant="flag-active" data-testid="badge">Active</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('flag-active');
  });

  it('TC-2782: renders flag-draft variant', () => {
    render(<Badge variant="flag-draft" data-testid="badge">Draft</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('flag-draft');
  });

  it('TC-2783: renders flag-completed variant', () => {
    render(<Badge variant="flag-completed" data-testid="badge">Done</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('flag-completed');
  });

  it('TC-2784: accepts custom className', () => {
    render(<Badge className="custom-class" data-testid="badge">Custom</Badge>);
    expect(screen.getByTestId('badge')).toHaveClass('custom-class');
  });

  it('TC-2785: renders as child element with asChild', () => {
    render(
      <Badge asChild>
        <a href="/test" data-testid="link-badge">Link</a>
      </Badge>
    );
    const el = screen.getByTestId('link-badge');
    expect(el.tagName).toBe('A');
    expect(el).toHaveAttribute('href', '/test');
  });
});
