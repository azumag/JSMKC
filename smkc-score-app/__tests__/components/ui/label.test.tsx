/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { Label } from '@/components/ui/label';

describe('Label', () => {
  it('TC-2840: renders with data-slot="label"', () => {
    render(<Label>Username</Label>);
    expect(screen.getByText('Username')).toHaveAttribute('data-slot', 'label');
  });

  it('TC-2841: forwards custom className', () => {
    render(<Label className="my-label">Name</Label>);
    expect(screen.getByText('Name')).toHaveClass('my-label');
  });

  it('TC-2842: renders children', () => {
    render(<Label>Player nickname</Label>);
    expect(screen.getByText('Player nickname')).toBeInTheDocument();
  });

  it('TC-2843: associates with input via htmlFor', () => {
    render(
      <>
        <Label htmlFor="player-input">Player</Label>
        <input id="player-input" />
      </>
    );
    const label = screen.getByText('Player');
    expect(label).toHaveAttribute('for', 'player-input');
  });

  it('TC-2844: renders as a <label> element', () => {
    render(<Label>Score</Label>);
    expect(screen.getByText('Score').tagName).toBe('LABEL');
  });

  it('TC-2845: forwards additional HTML attributes', () => {
    render(<Label data-testid="my-label">Time</Label>);
    expect(screen.getByTestId('my-label')).toBeInTheDocument();
    expect(screen.getByTestId('my-label')).toHaveTextContent('Time');
  });
});
