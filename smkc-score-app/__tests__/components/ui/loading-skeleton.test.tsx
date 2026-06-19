/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';

import {
  QualificationClientLoadingState,
  QualificationFallback,
  Skeleton,
} from '@/components/ui/loading-skeleton';

describe('QualificationFallback', () => {
  it('renders the supplied mode title as a level-one heading', () => {
    render(<QualificationFallback title="グランプリ" />);

    expect(screen.getByRole('heading', { level: 1, name: 'グランプリ' })).toBeInTheDocument();
  });

  it('omits the heading when no title is supplied', () => {
    render(<QualificationFallback />);

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('omits the heading when title is an empty string', () => {
    render(<QualificationFallback title="" />);

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});

describe('QualificationClientLoadingState', () => {
  it('keeps the supplied mode title as a level-one heading during client loading', () => {
    render(<QualificationClientLoadingState title="バトルモード" />);

    expect(screen.getByRole('heading', { level: 1, name: 'バトルモード' })).toBeInTheDocument();
  });

  it('renders the action-button placeholder by default', () => {
    render(<QualificationClientLoadingState title="マッチレース" />);

    expect(screen.getByTestId('qualification-action-skeleton')).toBeInTheDocument();
  });

  it('can omit the action-button placeholder for TA loading', () => {
    render(<QualificationClientLoadingState title="タイムアタック" showActionButton={false} />);

    expect(screen.queryByTestId('qualification-action-skeleton')).not.toBeInTheDocument();
  });

  it('uses the qualification page title skeleton width by default', () => {
    render(<QualificationClientLoadingState title="マッチレース" />);

    expect(screen.getByTestId('title-skeleton')).toHaveClass('w-48');
  });
});

describe('Skeleton accessibility contract (TC-2401)', () => {
  it('always renders with role="status" even when caller passes a different role', () => {
    // role must come after {...props} spread to prevent callers from accidentally
    // overriding the accessibility role (issue #2343)
    render(<Skeleton role="img" className="h-4 w-3/4" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('always renders with aria-label even when caller passes a different aria-label', () => {
    render(<Skeleton aria-label="custom label" className="h-4 w-3/4" />);

    expect(screen.getByRole('status', { name: 'Loading content' })).toBeInTheDocument();
  });

  it('passes through non-accessibility props from caller', () => {
    render(<Skeleton data-testid="my-skeleton" className="h-4 w-3/4" />);

    expect(screen.getByTestId('my-skeleton')).toBeInTheDocument();
  });
});
