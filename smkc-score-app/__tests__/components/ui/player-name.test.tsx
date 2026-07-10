/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { PlayerName } from '@/components/ui/player-name';

jest.mock('@/components/ui/country-flag', () => ({
  CountryFlag: ({ country }: { country?: string | null }) => <span data-testid="country-flag">{country}</span>,
}));

describe('PlayerName', () => {
  it("renders a player's country flag and nickname", () => {
    render(<PlayerName player={{ nickname: 'Mario', country: 'JP' }} locale="en" />);

    expect(screen.getByTestId('country-flag')).toHaveTextContent('JP');
    expect(screen.getByText('Mario')).toHaveClass('truncate');
  });

  it("supports a caller-specific display label while retaining the player's flag", () => {
    render(<PlayerName player={{ nickname: 'Mario', country: 'JP' }} locale="en" displayName="Mario (Taro)" />);

    expect(screen.getByTestId('country-flag')).toBeInTheDocument();
    expect(screen.getByText('Mario (Taro)')).toBeInTheDocument();
  });

  it('hides the flag and renders muted fallback text for an unresolved bracket slot', () => {
    render(<PlayerName player={{ nickname: 'Mario', country: 'JP' }} locale="en" forceFallback fallback="TBD" />);

    expect(screen.queryByTestId('country-flag')).not.toBeInTheDocument();
    expect(screen.getByText('TBD')).toHaveClass('text-muted-foreground');
  });
});
