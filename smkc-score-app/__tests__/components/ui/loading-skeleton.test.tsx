/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';

import { QualificationClientLoadingState, QualificationFallback, Skeleton } from '@/components/ui/loading-skeleton';
import enLoadingSkeleton from '../../../messages/loading-skeleton/en.json';
import jaLoadingSkeleton from '../../../messages/loading-skeleton/ja.json';

const mockLoadingSkeletonMessages = {
  en: enLoadingSkeleton,
  ja: jaLoadingSkeleton,
};
let mockLocale: keyof typeof mockLoadingSkeletonMessages = 'en';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof enLoadingSkeleton) => mockLoadingSkeletonMessages[mockLocale][key],
}));

beforeEach(() => {
  mockLocale = 'en';
});

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

  it('defaults the qualification title skeleton to w-48', () => {
    render(<QualificationClientLoadingState title="マッチレース" />);

    expect(screen.getByTestId('title-skeleton')).toHaveClass('w-48');
  });
});

describe('Skeleton accessibility contract (TC-2401)', () => {
  it('keeps the status role authoritative over caller props', () => {
    // role must come after {...props} spread to prevent callers from accidentally
    // overriding the accessibility role (issue #2343)
    render(<Skeleton role="img" className="h-4 w-3/4" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('keeps the localized aria-label authoritative over caller props', () => {
    render(<Skeleton aria-label="custom label" className="h-4 w-3/4" />);

    expect(screen.getByRole('status', { name: 'Loading content' })).toBeInTheDocument();
  });

  it('keeps the Japanese aria-label authoritative over caller props', () => {
    mockLocale = 'ja';
    render(<Skeleton aria-label="custom label" className="h-4 w-3/4" />);

    expect(screen.getByRole('status', { name: 'コンテンツを読み込み中' })).toBeInTheDocument();
  });

  it('uses the Japanese status label for Japanese locale', () => {
    mockLocale = 'ja';
    render(<Skeleton className="h-4 w-3/4" />);

    expect(screen.getByRole('status', { name: 'コンテンツを読み込み中' })).toBeInTheDocument();
  });

  it('passes through non-accessibility props from caller', () => {
    render(<Skeleton data-testid="my-skeleton" className="h-4 w-3/4" />);

    expect(screen.getByTestId('my-skeleton')).toBeInTheDocument();
  });
});

describe('Skeleton translation catalog', () => {
  it('keeps English and Japanese loading-skeleton keys aligned', () => {
    expect(Object.keys(jaLoadingSkeleton).sort()).toEqual(Object.keys(enLoadingSkeleton).sort());
  });
});
