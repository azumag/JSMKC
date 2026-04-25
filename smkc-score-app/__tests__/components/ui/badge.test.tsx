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
  it('renders children', () => {
    render(<Badge>Hello</Badge>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders with default variant classes', () => {
    render(<Badge data-testid="badge">Default</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('bg-primary', 'text-primary-foreground');
  });

  it('renders secondary variant', () => {
    render(<Badge variant="secondary" data-testid="badge">Secondary</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('bg-secondary', 'text-secondary-foreground');
  });

  it('renders destructive variant', () => {
    render(<Badge variant="destructive" data-testid="badge">Error</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('bg-destructive', 'text-white');
  });

  it('renders outline variant', () => {
    render(<Badge variant="outline" data-testid="badge">Outline</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('border-foreground/70', 'bg-transparent');
  });

  it('renders flag-active variant', () => {
    render(<Badge variant="flag-active" data-testid="badge">Active</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('flag-active');
  });

  it('renders flag-draft variant', () => {
    render(<Badge variant="flag-draft" data-testid="badge">Draft</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('flag-draft');
  });

  it('renders flag-completed variant', () => {
    render(<Badge variant="flag-completed" data-testid="badge">Done</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveClass('flag-completed');
  });

  it('accepts custom className', () => {
    render(<Badge className="custom-class" data-testid="badge">Custom</Badge>);
    expect(screen.getByTestId('badge')).toHaveClass('custom-class');
  });

  it('renders as child element with asChild', () => {
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
