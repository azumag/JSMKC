/**
 * @jest-environment jsdom
 */

/**
 * @module Input Component Tests
 *
 * Unit tests for the Input UI component.
 * Covers:
 * - Rendering as native <input> with data-slot
 * - Type prop forwarding
 * - Value / onChange callback forwarding
 * - Disabled state
 * - aria-invalid for validation styling
 * - Custom className passthrough
 * - Placeholder forwarding
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('TC-2759: renders as an <input> element', () => {
    render(<Input placeholder="Type here" />);
    expect(screen.getByPlaceholderText('Type here').tagName).toBe('INPUT');
  });

  it('TC-2760: has data-slot="input" attribute', () => {
    render(<Input data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveAttribute('data-slot', 'input');
  });

  it('TC-2761: forwards the type prop', () => {
    render(<Input type="email" data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'email');
  });

  it('TC-2762: displays value and calls onChange', () => {
    const handleChange = jest.fn();
    render(<Input value="hello" onChange={handleChange} />);
    const el = screen.getByDisplayValue('hello');
    fireEvent.change(el, { target: { value: 'world' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('TC-2763: disabled state sets disabled attribute', () => {
    render(<Input disabled data-testid="input" />);
    expect(screen.getByTestId('input')).toBeDisabled();
  });

  it('TC-2764: aria-invalid attribute is forwarded', () => {
    render(<Input aria-invalid="true" data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveAttribute('aria-invalid', 'true');
  });

  it('TC-2765: accepts and applies custom className', () => {
    render(<Input className="custom-input" data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveClass('custom-input');
  });

  it('TC-2766: forwards placeholder prop', () => {
    render(<Input placeholder="Enter time" />);
    expect(screen.getByPlaceholderText('Enter time')).toBeInTheDocument();
  });
});
