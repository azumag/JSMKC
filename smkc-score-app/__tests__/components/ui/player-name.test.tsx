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

  it('renders a missing player fallback in the normal text color', () => {
    render(<PlayerName player={null} locale="en" fallback="TBD" />);

    expect(screen.queryByTestId('country-flag')).not.toBeInTheDocument();
    expect(screen.getByText('TBD')).not.toHaveClass('text-muted-foreground');
  });

  it('keeps a missing nickname fallback in the normal text color', () => {
    render(<PlayerName player={{ nickname: null, country: 'JP' }} locale="en" fallback="TBD" />);

    expect(screen.queryByTestId('country-flag')).not.toBeInTheDocument();
    expect(screen.getByText('TBD')).not.toHaveClass('text-muted-foreground');
  });

  it('merges caller classes through tailwind-merge', () => {
    const { container } = render(
      <PlayerName
        player={{ nickname: 'Mario' }}
        locale="en"
        className="gap-4 custom-wrapper"
        nameClassName="overflow-visible custom-name"
      />,
    );

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass('gap-4', 'custom-wrapper');
    expect(wrapper).not.toHaveClass('gap-1.5');
    expect(screen.getByText('Mario')).toHaveClass('overflow-visible', 'custom-name');
  });
});
