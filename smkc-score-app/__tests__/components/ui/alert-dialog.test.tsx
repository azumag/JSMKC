/**
 * @jest-environment jsdom
 */

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

describe('AlertDialog Components', () => {
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
    it('TC-2873: trigger element がレンダリングされる', () => {
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

    it('TC-2874: data-testid でアクセスできる', () => {
      renderAlertDialog();

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
    });
  });

  describe('AlertDialogPortal', () => {
    it('TC-2875: portal 内にコンテンツをレンダリングする', () => {
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
    it('TC-2876: fixed/inset-0/z-50/paddock-overlay クラスを持つ', () => {
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
      expect(overlay).toHaveClass('fixed', 'inset-0', 'z-50', 'paddock-overlay');
    });

    it('TC-2877: AlertDialogContent にカスタム className が転送される', () => {
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
    it('TC-2878: children をレンダリングする', () => {
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

    it('TC-2879: fixed/left-[50%]/top-[50%]/z-50 位置クラスを持つ', () => {
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

    it('TC-2880: カスタム className が転送される', () => {
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
    it('TC-2881: children をレンダリングする', () => {
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

    it('TC-2882: flex/flex-col/gap-1.5/pb-3 レイアウトクラスを持つ', () => {
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
      expect(header).toHaveClass('flex', 'flex-col', 'gap-1.5', 'pb-3');
    });

    it('TC-2883: カスタム className が転送される', () => {
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
    it('TC-2884: children をレンダリングする', () => {
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

    it('TC-2885: flex-col-reverse/sm:flex-row/sm:justify-end/sm:space-x-2 クラスを持つ', () => {
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

    it('TC-2886: カスタム className が転送される', () => {
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
    it('TC-2887: テキストをレンダリングする', () => {
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

    it('TC-2888: font-display/text-2xl タイポグラフィクラスを持つ', () => {
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
      expect(title).toHaveClass('font-display', 'text-2xl');
    });

    it('TC-2889: カスタム className が転送される', () => {
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
    it('TC-2890: テキストをレンダリングする', () => {
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

    it('TC-2891: font-mono/text-xs/text-muted-foreground クラスを持つ', () => {
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
      expect(description).toHaveClass('font-mono', 'text-xs', 'text-muted-foreground');
    });

    it('TC-2892: カスタム className が転送される', () => {
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
    it('TC-2893: ボタンをレンダリングする', () => {
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

    it('TC-2894: button 要素としてレンダリングされる', () => {
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
      expect(action.tagName).toBe('BUTTON');
    });

    it('TC-2895: カスタム className が転送される', () => {
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
    it('TC-2896: ボタンをレンダリングする', () => {
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

    it('TC-2897: button 要素としてレンダリングされる', () => {
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
      expect(cancel.tagName).toBe('BUTTON');
    });

    it('TC-2898: mt-2/sm:mt-0 モバイルレイアウトクラスを持つ', () => {
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

    it('TC-2899: カスタム className が転送される', () => {
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

  describe('Integration', () => {
    it('TC-2900: 全サブコンポーネントを含む完全な AlertDialog をレンダリングする', () => {
      renderAlertDialog();

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
    });

    it('TC-2901: AlertDialog root に追加 props を渡せる', () => {
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
    it('TC-2902: AlertDialogTitle が heading ロールを持つ', () => {
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
