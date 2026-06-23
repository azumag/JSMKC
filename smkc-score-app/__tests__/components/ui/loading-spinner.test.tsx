/**
 * @jest-environment jsdom
 *
 * Unit tests for the LoadingSpinner component (TC-2719 through TC-2725).
 *
 * LoadingSpinner renders an animated Loader2 icon with accessibility
 * attributes and three configurable size variants.
 */
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

describe('LoadingSpinner — accessibility', () => {
  it('TC-2719: has role="status" for screen reader announcement', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('TC-2720: has aria-live="polite" to avoid interrupting screen reader', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('TC-2721: has aria-label="Loading" as descriptive text', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
  });
});

describe('LoadingSpinner — size variants', () => {
  it('TC-2722: default (md) size applies h-6 w-6 to the icon', () => {
    const { container } = render(<LoadingSpinner />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('h-6', 'w-6');
  });

  it('TC-2723: sm size applies h-4 w-4 to the icon', () => {
    const { container } = render(<LoadingSpinner size="sm" />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('h-4', 'w-4');
  });

  it('TC-2724: lg size applies h-8 w-8 to the icon', () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('h-8', 'w-8');
  });

  it('TC-2725: additional className is forwarded to the wrapper div', () => {
    render(<LoadingSpinner className="my-custom-class" />);
    expect(screen.getByRole('status')).toHaveClass('my-custom-class');
  });
});
