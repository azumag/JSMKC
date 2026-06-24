/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

describe('Alert', () => {
  it('TC-2852: renders with role="alert"', () => {
    render(<Alert>content</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('TC-2853: renders children', () => {
    render(<Alert>Alert message</Alert>);
    expect(screen.getByText('Alert message')).toBeInTheDocument();
  });

  it('TC-2854: forwards custom className', () => {
    render(<Alert className="my-alert">text</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('my-alert');
  });

  it('TC-2855: default variant includes border-l-accent class', () => {
    render(<Alert>default</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('border-l-accent');
  });

  it('TC-2856: destructive variant includes border-l-destructive class', () => {
    render(<Alert variant="destructive">error</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('border-l-destructive');
  });

  describe('AlertTitle', () => {
    it('TC-2857: renders as an h5 element', () => {
      render(<Alert><AlertTitle>Warning</AlertTitle></Alert>);
      const title = screen.getByText('Warning');
      expect(title.tagName).toBe('H5');
    });

    it('TC-2858: renders children', () => {
      render(<Alert><AlertTitle>Score saved</AlertTitle></Alert>);
      expect(screen.getByText('Score saved')).toBeInTheDocument();
    });

    it('TC-2859: forwards custom className', () => {
      render(<Alert><AlertTitle className="title-class">T</AlertTitle></Alert>);
      expect(screen.getByText('T')).toHaveClass('title-class');
    });
  });

  describe('AlertDescription', () => {
    it('TC-2860: renders children', () => {
      render(<Alert><AlertDescription>Details here</AlertDescription></Alert>);
      expect(screen.getByText('Details here')).toBeInTheDocument();
    });

    it('TC-2861: forwards custom className', () => {
      render(<Alert><AlertDescription className="desc-class">D</AlertDescription></Alert>);
      expect(screen.getByText('D')).toHaveClass('desc-class');
    });
  });
});
