/**
 * @jest-environment jsdom
 */

/**
 * @module Switch Component Tests
 *
 * Unit tests for the Switch UI component.
 * Covers:
 * - Semantic role="switch" with aria-checked attribute
 * - Click handler forwarding (checked/unchecked toggling)
 * - Disabled state prevents toggling
 * - Keyboard interaction: Space and Enter keys
 * - aria-label and id passthrough
 * - Custom className passthrough
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { Switch } from '@/components/ui/switch';

const defaultProps = {
  checked: false,
  onCheckedChange: jest.fn(),
  'aria-label': 'Toggle feature',
};

describe('Switch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC-2788: renders as a button with role="switch"', () => {
    render(<Switch {...defaultProps} />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByRole('switch').tagName).toBe('BUTTON');
  });

  it('TC-2789: aria-checked is false when checked=false', () => {
    render(<Switch {...defaultProps} checked={false} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('TC-2790: aria-checked is true when checked=true', () => {
    render(<Switch {...defaultProps} checked={true} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('TC-2791: aria-label is applied to the button', () => {
    render(<Switch {...defaultProps} aria-label="Enable notifications" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-label', 'Enable notifications');
  });

  it('TC-2792: calls onCheckedChange(true) when unchecked switch is clicked', () => {
    const onCheckedChange = jest.fn();
    render(<Switch {...defaultProps} checked={false} onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('TC-2793: calls onCheckedChange(false) when checked switch is clicked', () => {
    const onCheckedChange = jest.fn();
    render(<Switch {...defaultProps} checked={true} onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it('TC-2794: does not call onCheckedChange when disabled and clicked', () => {
    const onCheckedChange = jest.fn();
    render(<Switch {...defaultProps} disabled onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('TC-2795: disabled attribute is applied when disabled=true', () => {
    render(<Switch {...defaultProps} disabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('TC-2796: Space key calls onCheckedChange', () => {
    const onCheckedChange = jest.fn();
    render(<Switch {...defaultProps} checked={false} onCheckedChange={onCheckedChange} />);
    fireEvent.keyDown(screen.getByRole('switch'), { key: ' ' });
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('TC-2797: Enter key calls onCheckedChange', () => {
    const onCheckedChange = jest.fn();
    render(<Switch {...defaultProps} checked={false} onCheckedChange={onCheckedChange} />);
    fireEvent.keyDown(screen.getByRole('switch'), { key: 'Enter' });
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('TC-2798: custom className is applied to the button', () => {
    render(<Switch {...defaultProps} className="my-switch-class" />);
    expect(screen.getByRole('switch')).toHaveClass('my-switch-class');
  });

  it('TC-2799: id attribute is forwarded to the button', () => {
    render(<Switch {...defaultProps} id="feature-switch" />);
    expect(screen.getByRole('switch')).toHaveAttribute('id', 'feature-switch');
  });

  it('TC-2800: Space key does not call onCheckedChange when disabled', () => {
    const onCheckedChange = jest.fn();
    render(<Switch {...defaultProps} disabled onCheckedChange={onCheckedChange} />);
    fireEvent.keyDown(screen.getByRole('switch'), { key: ' ' });
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('TC-2801: Enter key does not call onCheckedChange when disabled', () => {
    const onCheckedChange = jest.fn();
    render(<Switch {...defaultProps} disabled onCheckedChange={onCheckedChange} />);
    fireEvent.keyDown(screen.getByRole('switch'), { key: 'Enter' });
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
