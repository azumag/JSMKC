/**
 * @jest-environment jsdom
 */

/**
 * @module Button Component Tests
 *
 * Unit tests for the Button UI component.
 * Covers:
 * - All 6 variants: default, destructive, outline, secondary, ghost, link
 * - Size variants: sm, lg, icon
 * - Disabled state and event suppression
 * - onClick handler forwarding
 * - asChild: renders the Slot child instead of <button>
 * - data-slot / data-variant attributes
 * - Custom className passthrough
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('TC-2741: renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('TC-2742: default variant applies bg-primary class', () => {
    render(<Button data-testid="btn">Default</Button>);
    expect(screen.getByTestId('btn')).toHaveClass('bg-primary');
  });

  it('TC-2743: destructive variant applies bg-destructive class', () => {
    render(<Button variant="destructive" data-testid="btn">Delete</Button>);
    expect(screen.getByTestId('btn')).toHaveClass('bg-destructive');
  });

  it('TC-2744: outline variant applies border class', () => {
    render(<Button variant="outline" data-testid="btn">Outline</Button>);
    const el = screen.getByTestId('btn');
    expect(el).toHaveClass('border');
    expect(el).toHaveClass('bg-transparent');
  });

  it('TC-2745: secondary variant applies bg-secondary class', () => {
    render(<Button variant="secondary" data-testid="btn">Secondary</Button>);
    expect(screen.getByTestId('btn')).toHaveClass('bg-secondary');
  });

  it('TC-2746: ghost variant applies hover class without background fill', () => {
    render(<Button variant="ghost" data-testid="btn">Ghost</Button>);
    const el = screen.getByTestId('btn');
    expect(el).toHaveClass('text-foreground');
    expect(el).not.toHaveClass('bg-primary');
  });

  it('TC-2747: link variant applies text-primary and underline-offset-4', () => {
    render(<Button variant="link" data-testid="btn">Link</Button>);
    const el = screen.getByTestId('btn');
    expect(el).toHaveClass('text-primary');
    expect(el).toHaveClass('underline-offset-4');
  });

  it('TC-2748: sm size applies h-8 class', () => {
    render(<Button size="sm" data-testid="btn">Small</Button>);
    expect(screen.getByTestId('btn')).toHaveClass('h-8');
  });

  it('TC-2749: lg size applies h-10 class', () => {
    render(<Button size="lg" data-testid="btn">Large</Button>);
    expect(screen.getByTestId('btn')).toHaveClass('h-10');
  });

  it('TC-2750: icon size applies size-9 class', () => {
    render(<Button size="icon" data-testid="btn">✕</Button>);
    expect(screen.getByTestId('btn')).toHaveClass('size-9');
  });

  it('TC-2751: disabled state sets disabled attribute and opacity-50 class', () => {
    render(<Button disabled data-testid="btn">Disabled</Button>);
    const el = screen.getByTestId('btn');
    expect(el).toBeDisabled();
    expect(el).toHaveClass('disabled:opacity-50');
  });

  it('TC-2752: onClick fires on click', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Click' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('TC-2753: onClick is not called when disabled', () => {
    const handleClick = jest.fn();
    render(<Button disabled onClick={handleClick}>Disabled</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Disabled' }));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('TC-2754: asChild renders child element instead of <button>', () => {
    render(
      <Button asChild>
        <a href="/test" data-testid="link-btn">Link Button</a>
      </Button>
    );
    const el = screen.getByTestId('link-btn');
    expect(el.tagName).toBe('A');
    expect(el).toHaveAttribute('href', '/test');
  });

  it('TC-2755: has data-slot="button" attribute', () => {
    render(<Button data-testid="btn">Slot</Button>);
    expect(screen.getByTestId('btn')).toHaveAttribute('data-slot', 'button');
  });

  it('TC-2756: data-variant attribute matches the applied variant', () => {
    render(<Button variant="destructive" data-testid="btn">Btn</Button>);
    expect(screen.getByTestId('btn')).toHaveAttribute('data-variant', 'destructive');
  });

  it('TC-2757: accepts and applies custom className', () => {
    render(<Button className="my-custom-class" data-testid="btn">Custom</Button>);
    expect(screen.getByTestId('btn')).toHaveClass('my-custom-class');
  });

  it('TC-2758: renders as a native <button> element by default', () => {
    render(<Button data-testid="btn">Native</Button>);
    expect(screen.getByTestId('btn').tagName).toBe('BUTTON');
  });
});
