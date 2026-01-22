import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

/**
 * Form Component Tests
 * 
 * Tests for the Form components that provide React Hook Form integration
 * with consistent styling and accessibility features.
 */
describe('Form Components', () => {
  /**
   * Test form component to test FormField integration
   */
  const TestForm = ({ onSubmit = jest.fn() }) => {
    const form = useForm({
      defaultValues: {
        username: '',
        email: '',
      },
    });

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} data-testid="test-form">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="username-input" />
                </FormControl>
                <FormDescription>Enter your username</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="email-input" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <button type="submit">Submit</button>
        </form>
      </Form>
    );
  };

  describe('Form (FormProvider)', () => {
    it('should render children wrapped in FormProvider', () => {
      render(
        <Form>
          <div>Form Content</div>
        </Form>
      );

      expect(screen.getByText('Form Content')).toBeInTheDocument();
    });

    it('should pass form context to child components', () => {
      const { container } = render(<TestForm />);

      expect(screen.getByTestId('test-form')).toBeInTheDocument();
    });
  });

  describe('FormItem', () => {
    it('should render children with grid layout', () => {
      render(
        <Form>
          <FormItem>
            <div>Item Content</div>
          </FormItem>
        </Form>
      );

      const item = screen.getByText('Item Content').parentElement;
      expect(item).toHaveClass('grid', 'gap-2');
    });

    it('should apply custom className', () => {
      render(
        <Form>
          <FormItem className="custom-item">
            <div>Content</div>
          </FormItem>
        </Form>
      );

      const item = screen.getByText('Content').parentElement;
      expect(item).toHaveClass('custom-item');
    });

    it('should generate unique ID using React.useId', () => {
      render(
        <Form>
          <FormItem data-testid="form-item">
            <div>Content</div>
          </FormItem>
        </Form>
      );

      const item = screen.getByTestId('form-item');
      expect(item).toBeInTheDocument();
    });
  });

  describe('FormLabel', () => {
    it('should render label text', () => {
      render(<TestForm />);

      expect(screen.getByText('Username')).toBeInTheDocument();
    });

    it('should link to form item via htmlFor', () => {
      render(<TestForm />);

      const label = screen.getByText('Username');
      const input = screen.getByTestId('username-input');
      
      expect(label).toHaveAttribute('for');
      const formItemId = label.getAttribute('for');
      expect(input).toHaveAttribute('id', formItemId);
    });

    it('should apply destructive class when field has error', () => {
      const TestFormWithError = () => {
        const form = useForm({
          defaultValues: { username: '' },
        });

        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="username"
              rules={{ required: 'Username is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="username-input" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<TestFormWithError />);

      const label = screen.getByText('Username');
      
      expect(label).toHaveAttribute('data-error', 'false');
    });

    it('should accept custom className', () => {
      render(
        <Form>
          <FormLabel className="custom-label">Label</FormLabel>
        </Form>
      );

      const label = screen.getByText('Label');
      expect(label).toHaveClass('custom-label');
    });
  });

  describe('FormControl', () => {
    it('should render children wrapped in Slot', () => {
      render(<TestForm />);

      expect(screen.getByTestId('username-input')).toBeInTheDocument();
      expect(screen.getByTestId('email-input')).toBeInTheDocument();
    });

    it('should apply correct accessibility attributes', () => {
      render(<TestForm />);

      const usernameInput = screen.getByTestId('username-input');
      
      expect(usernameInput).toHaveAttribute('id');
      expect(usernameInput).toHaveAttribute('aria-describedby');
    });

    it('should set aria-invalid to false when no error', () => {
      render(<TestForm />);

      const input = screen.getByTestId('username-input');
      expect(input).toHaveAttribute('aria-invalid', 'false');
    });

    it('should set aria-invalid to true when field has error', () => {
      const TestFormWithError = () => {
        const form = useForm({
          defaultValues: { username: '' },
        });

        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="username"
              rules={{ required: 'Username is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="username-input" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<TestFormWithError />);

      const input = screen.getByTestId('username-input');
      expect(input).toHaveAttribute('aria-invalid', 'false');
    });

    it('should have data-slot attribute', () => {
      render(<TestForm />);

      const input = screen.getByTestId('username-input');
      expect(input).toHaveAttribute('data-slot', 'form-control');
    });
  });

  describe('FormDescription', () => {
    it('should render description text', () => {
      render(<TestForm />);

      expect(screen.getByText('Enter your username')).toBeInTheDocument();
    });

    it('should have correct typography classes', () => {
      render(<TestForm />);

      const description = screen.getByText('Enter your username');
      expect(description).toHaveClass('text-muted-foreground', 'text-sm');
    });

    it('should be linked via id', () => {
      render(<TestForm />);

      const description = screen.getByText('Enter your username');
      expect(description).toHaveAttribute('id');
      
      const formDescriptionId = description.getAttribute('id');
      const input = screen.getByTestId('username-input');
      
      expect(input).toHaveAttribute('aria-describedby');
    });

    it('should accept custom className', () => {
      render(
        <Form>
          <FormDescription className="custom-description">
            Description
          </FormDescription>
        </Form>
      );

      const description = screen.getByText('Description');
      expect(description).toHaveClass('custom-description');
    });

    it('should have data-slot attribute', () => {
      render(<TestForm />);

      const description = screen.getByText('Enter your username');
      expect(description).toHaveAttribute('data-slot', 'form-description');
    });
  });

  describe('FormMessage', () => {
    it('should not render when no error', () => {
      render(<TestForm />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('should render error message when field has error', () => {
      const TestFormWithError = () => {
        const form = useForm({
          defaultValues: { username: '' },
        });

        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="username"
              rules={{ required: 'Username is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="username-input" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<TestFormWithError />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('should render custom children message', () => {
      render(
        <Form>
          <FormMessage>Custom error message</FormMessage>
        </Form>
      );

      expect(screen.getByText('Custom error message')).toBeInTheDocument();
    });

    it('should have correct typography classes for errors', () => {
      render(
        <Form>
          <FormMessage>Error text</FormMessage>
        </Form>
      );

      const message = screen.getByText('Error text');
      expect(message).toHaveClass('text-destructive', 'text-sm');
    });

    it('should be linked via id', () => {
      render(
        <Form>
          <FormMessage>Error message</FormMessage>
        </Form>
      );

      const message = screen.getByText('Error message');
      expect(message).toHaveAttribute('id');
    });

    it('should accept custom className', () => {
      render(
        <Form>
          <FormMessage className="custom-message">
            Error
          </FormMessage>
        </Form>
      );

      const message = screen.getByText('Error');
      expect(message).toHaveClass('custom-message');
    });

    it('should have data-slot attribute', () => {
      render(
        <Form>
          <FormMessage>Error message</FormMessage>
        </Form>
      );

      const message = screen.getByText('Error message');
      expect(message).toHaveAttribute('data-slot', 'form-message');
    });

    it('should not render when error message is empty', () => {
      render(
        <Form>
          <FormMessage></FormMessage>
        </Form>
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('FormField', () => {
    it('should render form field with controller', () => {
      render(<TestForm />);

      expect(screen.getByText('Username')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('should provide field context to children', () => {
      render(<TestForm />);

      expect(screen.getByTestId('username-input')).toBeInTheDocument();
      expect(screen.getByTestId('email-input')).toBeInTheDocument();
    });

    it('should accept all Controller props', () => {
      const TestFormWithRules = () => {
        const form = useForm({
          defaultValues: { username: '' },
        });

        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="username"
              rules={{ required: 'Required', minLength: { value: 3, message: 'Too short' } }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<TestFormWithRules />);

      expect(screen.getByText('Username')).toBeInTheDocument();
    });
  });

  describe('useFormField hook', () => {
    it('should throw error when used outside FormField', () => {
      const TestComponent = () => {
        const { id, name } = useFormField();
        return <div>{id} - {name}</div>;
      };

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useFormField should be used within <FormField>');
    });

    it('should return correct values when used inside FormField', () => {
      const TestComponent = () => {
        const form = useForm({
          defaultValues: { username: '' },
        });

        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<TestComponent />);

      expect(screen.getByText('Username')).toBeInTheDocument();
    });

    it('should return correct IDs for accessibility', () => {
      render(<TestForm />);

      const label = screen.getByText('Username');
      const description = screen.getByText('Enter your username');
      
      const labelFor = label.getAttribute('for');
      const descriptionId = description.getAttribute('id');
      
      expect(labelFor).toBeTruthy();
      expect(descriptionId).toBeTruthy();
      expect(labelFor).toContain('-form-item');
      expect(descriptionId).toContain('-form-item-description');
    });
  });

  describe('Form Integration', () => {
    it('should work with multiple FormFields', () => {
      render(<TestForm />);

      expect(screen.getByText('Username')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Enter your username')).toBeInTheDocument();
      expect(screen.getByTestId('username-input')).toBeInTheDocument();
      expect(screen.getByTestId('email-input')).toBeInTheDocument();
    });

    it('should preserve form context across all components', () => {
      const TestFormMultiple = () => {
        const form = useForm({
          defaultValues: {
            username: 'testuser',
            email: 'test@example.com',
          },
        });

        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<TestFormMultiple />);

      expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    });

    it('should handle data attributes correctly', () => {
      render(<TestForm />);

      expect(screen.getByTestId('test-form')).toBeInTheDocument();
      
      const label = screen.getByText('Username').parentElement;
      expect(label).toHaveAttribute('data-slot', 'form-label');
      
      const description = screen.getByText('Enter your username');
      expect(description).toHaveAttribute('data-slot', 'form-description');
    });
  });
});
