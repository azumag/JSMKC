/**
 * @jest-environment jsdom
 */

const errorTranslations: Record<string, string> = {
  errorOccurred: 'Error Occurred',
  unexpected: 'An unexpected error occurred.',
  fetchError: 'Unable to load data. Please refresh the page.',
  networkError: 'Connection error. Please check your internet connection.',
  timeoutError: 'Request timed out. Please try again.',
  genericError: 'Something went wrong. Please try again.',
  tryAgain: 'Try Again',
  goBack: 'Go Back',
};

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => errorTranslations[key] ?? key,
}));

import { render, screen } from '@testing-library/react';
import { ErrorFallback } from '@/components/ErrorBoundary';

describe('ErrorFallback alert semantics', () => {
  it('announces the translated fallback without exposing raw runtime details', () => {
    render(<ErrorFallback error={new Error('internal-service-secret-detail')} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Error Occurred');
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
    expect(alert).not.toHaveTextContent('internal-service-secret-detail');
  });
});
