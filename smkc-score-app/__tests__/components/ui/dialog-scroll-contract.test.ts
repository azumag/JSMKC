/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

describe('DialogContent viewport scrolling contract', () => {
  it('bounds rendered dialogs to the viewport and enables vertical scrolling by default', () => {
    render(
      React.createElement(
        Dialog,
        { open: true },
        React.createElement(
          DialogContent,
          { className: 'max-w-xl' },
          React.createElement(DialogTitle, null, 'Long form'),
          React.createElement(DialogDescription, null, 'A dialog whose content may exceed the viewport height.'),
          React.createElement('div', null, 'Form content'),
        ),
      ),
    );

    const dialog = screen.getByRole('dialog', { name: 'Long form' });

    expect(dialog).toHaveClass('max-h-[90vh]');
    expect(dialog).toHaveClass('overflow-y-auto');
    expect(dialog).toHaveClass('max-w-xl');
  });
});
