/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';

import {
  QualificationClientLoadingState,
  QualificationFallback,
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
});
