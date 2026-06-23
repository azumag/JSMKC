/**
 * @jest-environment jsdom
 *
 * Unit tests for the LoadingOverlay component (TC-2726 through TC-2730).
 *
 * LoadingOverlay renders a full-screen blocking overlay with a spinner
 * and message, or returns null when isOpen=false.
 */
import { render, screen } from '@testing-library/react';
import { LoadingOverlay } from '@/components/ui/loading-overlay';

describe('LoadingOverlay — visibility', () => {
  it('TC-2726: renders nothing when isOpen=false', () => {
    const { container } = render(<LoadingOverlay isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('TC-2727: renders the overlay dialog when isOpen=true', () => {
    render(<LoadingOverlay isOpen={true} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('LoadingOverlay — message', () => {
  it('TC-2728: shows default "Processing..." when no message prop is given', () => {
    render(<LoadingOverlay isOpen={true} />);
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('TC-2729: shows custom message when message prop is provided', () => {
    render(<LoadingOverlay isOpen={true} message="ブラケット生成中" />);
    expect(screen.getByText('ブラケット生成中')).toBeInTheDocument();
    expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
  });
});

describe('LoadingOverlay — accessibility', () => {
  it('TC-2730: has role="dialog" and aria-modal="true" with aria-label="Loading"', () => {
    render(<LoadingOverlay isOpen={true} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Loading');
  });
});
