/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

describe('DialogContent viewport scrolling contract', () => {
  it('bounds rendered dialogs to the viewport and enables vertical scrolling by default', () => {
    render(
      <Dialog open>
        <DialogContent className="max-w-xl">
          <DialogTitle>Long form</DialogTitle>
          <DialogDescription>A dialog whose content may exceed the viewport height.</DialogDescription>
          <div>Form content</div>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Long form' });

    expect(dialog).toHaveClass('max-h-[90vh]');
    expect(dialog).toHaveClass('overflow-y-auto');
    expect(dialog).toHaveClass('max-w-xl');
  });
});
