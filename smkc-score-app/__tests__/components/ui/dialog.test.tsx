/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// Helper: render a Dialog with open=true to bypass portal/trigger complexity in unit tests.
function renderOpenDialog(children: React.ReactNode) {
  return render(
    <Dialog open>
      <DialogContent>{children}</DialogContent>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('TC-2862: DialogContent renders with data-slot="dialog-content" when dialog is open', () => {
    renderOpenDialog(<span>body</span>);
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeInTheDocument();
  });

  it('TC-2863: DialogContent renders its children', () => {
    renderOpenDialog(<p>Dialog body text</p>);
    expect(screen.getByText('Dialog body text')).toBeInTheDocument();
  });

  it('TC-2864: DialogContent shows a close button (data-slot="dialog-close") by default', () => {
    renderOpenDialog(<span>content</span>);
    const closeButtons = document.querySelectorAll('[data-slot="dialog-close"]');
    expect(closeButtons.length).toBeGreaterThan(0);
  });

  it('TC-2865: DialogContent hides the close button when showCloseButton=false', () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}><span>no-close</span></DialogContent>
      </Dialog>
    );
    // The built-in close button is absent; DialogClose from content is not rendered
    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content?.querySelector('[data-slot="dialog-close"]')).toBeNull();
  });

  it('TC-2866: DialogTrigger renders with data-slot="dialog-trigger"', () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
      </Dialog>
    );
    expect(screen.getByText('Open')).toHaveAttribute('data-slot', 'dialog-trigger');
  });

  it('TC-2867: DialogHeader renders with data-slot="dialog-header"', () => {
    renderOpenDialog(<DialogHeader data-testid="hdr">Header</DialogHeader>);
    expect(screen.getByTestId('hdr')).toHaveAttribute('data-slot', 'dialog-header');
  });

  it('TC-2868: DialogHeader forwards custom className', () => {
    renderOpenDialog(<DialogHeader data-testid="hdr" className="my-header">H</DialogHeader>);
    expect(screen.getByTestId('hdr')).toHaveClass('my-header');
  });

  it('TC-2869: DialogFooter renders with data-slot="dialog-footer"', () => {
    renderOpenDialog(<DialogFooter data-testid="ftr">Footer</DialogFooter>);
    expect(screen.getByTestId('ftr')).toHaveAttribute('data-slot', 'dialog-footer');
  });

  it('TC-2870: DialogFooter forwards custom className', () => {
    renderOpenDialog(<DialogFooter data-testid="ftr" className="my-footer">F</DialogFooter>);
    expect(screen.getByTestId('ftr')).toHaveClass('my-footer');
  });

  it('TC-2871: DialogTitle renders with data-slot="dialog-title"', () => {
    renderOpenDialog(
      <>
        <DialogTitle>Confirm action</DialogTitle>
        <DialogDescription>Description</DialogDescription>
      </>
    );
    expect(screen.getByText('Confirm action')).toHaveAttribute('data-slot', 'dialog-title');
  });

  it('TC-2872: DialogDescription renders with data-slot="dialog-description"', () => {
    renderOpenDialog(
      <>
        <DialogTitle>Title</DialogTitle>
        <DialogDescription>Please confirm</DialogDescription>
      </>
    );
    expect(screen.getByText('Please confirm')).toHaveAttribute('data-slot', 'dialog-description');
  });
});
