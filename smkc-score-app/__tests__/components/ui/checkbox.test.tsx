/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '@/components/ui/checkbox';

describe('Checkbox', () => {
  it('TC-2846: renders with data-slot="checkbox"', () => {
    render(<Checkbox data-testid="cb" />);
    expect(screen.getByTestId('cb')).toHaveAttribute('data-slot', 'checkbox');
  });

  it('TC-2847: renders as a button element (Radix CheckboxPrimitive.Root)', () => {
    render(<Checkbox data-testid="cb" />);
    expect(screen.getByTestId('cb').tagName).toBe('BUTTON');
  });

  it('TC-2848: forwards custom className to root', () => {
    render(<Checkbox data-testid="cb" className="my-checkbox" />);
    expect(screen.getByTestId('cb')).toHaveClass('my-checkbox');
  });

  it('TC-2849: unchecked state renders data-state="unchecked" by default', () => {
    render(<Checkbox data-testid="cb" />);
    expect(screen.getByTestId('cb')).toHaveAttribute('data-state', 'unchecked');
  });

  it('TC-2850: checked state renders data-state="checked" when checked=true', () => {
    render(<Checkbox data-testid="cb" checked={true} onCheckedChange={jest.fn()} />);
    expect(screen.getByTestId('cb')).toHaveAttribute('data-state', 'checked');
  });

  it('TC-2851: calls onCheckedChange when clicked', async () => {
    const user = userEvent.setup();
    const onCheckedChange = jest.fn();
    render(<Checkbox data-testid="cb" onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByTestId('cb'));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
  });
});
