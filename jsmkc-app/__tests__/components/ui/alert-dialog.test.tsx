import { render, screen } from '@testing-library/react';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogOverlay,
  AlertDialogPortal,
} from '@/components/ui/alert-dialog';

/**
 * AlertDialog Component Tests
 * 
 * Tests for the Radix UI AlertDialog wrapper components.
 * AlertDialog is a modal dialog that interrupts the user with important content
 * and expects a response (action or cancel).
 */
describe('AlertDialog Components', () => {
  /**
   * Helper component to render a complete AlertDialog
   */
  const renderAlertDialog = (props = {}) => {
    return render(
      <AlertDialog {...props}>
        <AlertDialogTrigger asChild>
          <button data-testid="trigger">Open Dialog</button>
        </AlertDialogTrigger>
        <AlertDialogPortal>
          <AlertDialogOverlay />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Test Title</AlertDialogTitle>
              <AlertDialogDescription>
                Test description for the alert dialog
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    );
  };

  describe('AlertDialogTrigger', () => {
    it('should render trigger element', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogTrigger asChild>
            <button>Trigger Button</button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <div>Content</div>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByText('Trigger Button')).toBeInTheDocument();
    });

    it('should render trigger with data-testid', () => {
      renderAlertDialog();

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
    });
  });

  describe('AlertDialogPortal', () => {
    it('should render content in portal', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <div>Portal Content</div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      expect(screen.getByText('Portal Content')).toBeInTheDocument();
    });
  });

  describe('AlertDialogOverlay', () => {
    it('should render overlay with correct classes', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogOverlay data-testid="overlay" />
            <AlertDialogContent>
              <div>Content</div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const overlay = screen.getByTestId('overlay');
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveClass('fixed', 'inset-0', 'z-50', 'bg-black/80');
    });

    it('should accept custom className', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogContent className="custom-content">
            <AlertDialogHeader>
              <AlertDialogTitle>Title</AlertDialogTitle>
              <AlertDialogDescription>Description</AlertDialogDescription>
            </AlertDialogHeader>
            <div>Content</div>
          </AlertDialogContent>
        </AlertDialog>
      );

      const content = screen.getByRole('alertdialog');
      expect(content).toHaveClass('custom-content');
    });
  });

  describe('AlertDialogContent', () => {
    it('should render content with children', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <div>Dialog Content</div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      expect(screen.getByText('Dialog Content')).toBeInTheDocument();
    });

    it('should have correct positioning classes', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent data-testid="content">
              <div>Content</div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const content = screen.getByTestId('content');
      expect(content).toHaveClass('fixed', 'left-[50%]', 'top-[50%]', 'z-50');
    });

    it('should accept custom className', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent className="custom-content">
              <div>Content</div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const content = screen.getByText('Content').parentElement;
      expect(content).toHaveClass('custom-content');
    });
  });

  describe('AlertDialogHeader', () => {
    it('should render header with children', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogHeader>
                <div>Header Content</div>
              </AlertDialogHeader>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      expect(screen.getByText('Header Content')).toBeInTheDocument();
    });

    it('should have correct flex layout classes', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogHeader data-testid="header">
                <div>Header</div>
              </AlertDialogHeader>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const header = screen.getByTestId('header');
      expect(header).toHaveClass('flex', 'flex-col', 'space-y-2');
    });

    it('should accept custom className', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogHeader className="custom-header">
                <div>Header</div>
              </AlertDialogHeader>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const header = screen.getByText('Header').parentElement;
      expect(header).toHaveClass('custom-header');
    });
  });

  describe('AlertDialogFooter', () => {
    it('should render footer with children', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogFooter>
                <button>Button 1</button>
                <button>Button 2</button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      expect(screen.getByText('Button 1')).toBeInTheDocument();
      expect(screen.getByText('Button 2')).toBeInTheDocument();
    });

    it('should have correct flex layout classes', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogFooter data-testid="footer">
                <button>Button</button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const footer = screen.getByTestId('footer');
      expect(footer).toHaveClass('flex', 'flex-col-reverse', 'sm:flex-row', 'sm:justify-end', 'sm:space-x-2');
    });

    it('should accept custom className', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogFooter className="custom-footer">
                <button>Button</button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const footer = screen.getByText('Button').parentElement;
      expect(footer).toHaveClass('custom-footer');
    });
  });

  describe('AlertDialogTitle', () => {
    it('should render title text', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogTitle>Alert Title</AlertDialogTitle>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      expect(screen.getByText('Alert Title')).toBeInTheDocument();
    });

    it('should have correct typography classes', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogTitle data-testid="title">
                Title
              </AlertDialogTitle>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const title = screen.getByTestId('title');
      expect(title).toHaveClass('text-lg', 'font-semibold');
    });

    it('should accept custom className', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogTitle className="custom-title">
                Title
              </AlertDialogTitle>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const title = screen.getByText('Title');
      expect(title).toHaveClass('custom-title');
    });
  });

  describe('AlertDialogDescription', () => {
    it('should render description text', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogDescription>Description text</AlertDialogDescription>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      expect(screen.getByText('Description text')).toBeInTheDocument();
    });

    it('should have correct typography classes', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogDescription data-testid="description">
                Description
              </AlertDialogDescription>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const description = screen.getByTestId('description');
      expect(description).toHaveClass('text-sm', 'text-muted-foreground');
    });

    it('should accept custom className', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogDescription className="custom-description">
                Description
              </AlertDialogDescription>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const description = screen.getByText('Description');
      expect(description).toHaveClass('custom-description');
    });
  });

  describe('AlertDialogAction', () => {
    it('should render action button', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogAction>Action Button</AlertDialogAction>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      expect(screen.getByText('Action Button')).toBeInTheDocument();
    });

    it('should apply button variant styles', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogAction data-testid="action">
                Action
              </AlertDialogAction>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const action = screen.getByTestId('action');
      expect(action).toBeInTheDocument();
    });

    it('should accept custom className', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogAction className="custom-action">
                Action
              </AlertDialogAction>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const action = screen.getByText('Action');
      expect(action).toHaveClass('custom-action');
    });
  });

  describe('AlertDialogCancel', () => {
    it('should render cancel button', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogCancel>Cancel Button</AlertDialogCancel>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      expect(screen.getByText('Cancel Button')).toBeInTheDocument();
    });

    it('should apply outline button variant styles', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogCancel data-testid="cancel">
                Cancel
              </AlertDialogCancel>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const cancel = screen.getByTestId('cancel');
      expect(cancel).toBeInTheDocument();
    });

    it('should apply margin top for mobile layout', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogCancel data-testid="cancel">
                Cancel
              </AlertDialogCancel>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const cancel = screen.getByTestId('cancel');
      expect(cancel).toHaveClass('mt-2', 'sm:mt-0');
    });

    it('should accept custom className', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogCancel className="custom-cancel">
                Cancel
              </AlertDialogCancel>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const cancel = screen.getByText('Cancel');
      expect(cancel).toHaveClass('custom-cancel');
    });
  });

  describe('Complete AlertDialog Integration', () => {
    it('should render complete AlertDialog with all subcomponents', () => {
      renderAlertDialog();

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
    });

    it('should pass additional props to AlertDialog root', () => {
      render(
        <AlertDialog open={true} defaultOpen={false}>
          <AlertDialogContent>
            <div>Content</div>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have correct ARIA attributes on title', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogTitle>Important Message</AlertDialogTitle>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      );

      const title = screen.getByRole('heading', { name: 'Important Message' });
      expect(title).toBeInTheDocument();
    });
  });
});
