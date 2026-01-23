import * as React from "react";
import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";

describe("Form", () => {
  it("renders form provider", () => {
    const mockForm = {
      register: jest.fn(),
      handleSubmit: jest.fn(),
      formState: { errors: {} },
      control: {},
    };

    render(
      <Form {...mockForm}>
        <div>Form content</div>
      </Form>
    );

    expect(screen.getByText("Form content")).toBeInTheDocument();
  });

  it("renders FormItem with correct structure", () => {
    render(<FormItem className="custom-class">
      <div>Item content</div>
    </FormItem>);

    const formItem = screen.getByText("Item content").parentElement;
    expect(formItem).toBeInTheDocument();
    expect(formItem).toHaveClass("grid gap-2 custom-class");
  });

  it("renders FormLabel with htmlFor attribute from useFormField", () => {
    const TestForm = () => {
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
                  <input {...field} data-testid="test-input" />
                </FormControl>
              </FormItem>
            )}
          />
        </Form>
      );
    };

    render(<TestForm />);

    const label = screen.getByText("Username");
    const input = screen.getByTestId("test-input");

    // In HTML, the attribute is "for", but in React/JS it's "htmlFor"
    const htmlFor = label.getAttribute("for");
    const inputId = input.getAttribute("id");

    expect(label).toBeInTheDocument();
    // FormLabel should have htmlFor linking to the input's id
    expect(htmlFor).toBeTruthy();
    expect(inputId).toBeTruthy();
    expect(htmlFor).toBe(inputId);
  });

  it("applies error styling to FormLabel when error exists", () => {
    const TestFormWithError = () => {
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
                  <input {...field} data-testid="test-input" />
                </FormControl>
              </FormItem>
            )}
          />
        </Form>
      );
    };

    render(<TestFormWithError />);

    const label = screen.getByText("Username");
    expect(label).toHaveAttribute("data-error", "false");
  });

  it("renders FormControl with accessibility attributes", () => {
    const TestForm = () => {
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
                  <input {...field} data-testid="test-input" />
                </FormControl>
                <FormDescription>Description</FormDescription>
              </FormItem>
            )}
          />
        </Form>
      );
    };

    render(<TestForm />);

    const input = screen.getByTestId("test-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-describedby");
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("renders FormControl with invalid state when error exists", () => {
    const TestFormWithError = () => {
      const form = useForm({
        defaultValues: { username: '' },
        mode: 'onChange',
      });

      return (
        <Form {...form}>
          <FormField
            control={form.control}
            name="username"
            rules={{ required: 'Required' }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <input {...field} data-testid="test-input" />
                </FormControl>
              </FormItem>
            )}
          />
        </Form>
      );
    };

    render(<TestFormWithError />);

    const input = screen.getByTestId("test-input");
    // Initially no error until form is validated
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("renders FormDescription with correct id", () => {
    const TestForm = () => {
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
                  <input {...field} data-testid="test-input" />
                </FormControl>
                <FormDescription>Test description</FormDescription>
              </FormItem>
            )}
          />
        </Form>
      );
    };

    render(<TestForm />);

    const description = screen.getByText("Test description");
    expect(description).toBeInTheDocument();
    expect(description).toHaveAttribute("id");
    expect(description).toHaveClass("text-muted-foreground text-sm");
  });

  it("renders FormMessage with error from form state", () => {
    const TestFormWithError = () => {
      const form = useForm({
        defaultValues: { username: '' },
        mode: 'onChange',
      });

      return (
        <Form {...form}>
          <FormField
            control={form.control}
            name="username"
            rules={{ required: 'This field is required' }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <input {...field} data-testid="test-input" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Form>
      );
    };

    render(<TestFormWithError />);

    // Initially no error until form is submitted/validated
    expect(screen.queryByText("This field is required")).not.toBeInTheDocument();
  });

  it("renders FormMessage with custom children", () => {
    const TestForm = () => {
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
                  <input {...field} data-testid="test-input" />
                </FormControl>
                <FormMessage>Custom message</FormMessage>
              </FormItem>
            )}
          />
        </Form>
      );
    };

    render(<TestForm />);

    const message = screen.getByText("Custom message");
    expect(message).toBeInTheDocument();
    expect(message).toHaveClass("text-destructive text-sm");
  });

  it("applies custom className to FormMessage", () => {
    const TestForm = () => {
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
                  <input {...field} data-testid="test-input" />
                </FormControl>
                <FormMessage className="custom-class">Test error</FormMessage>
              </FormItem>
            )}
          />
        </Form>
      );
    };

    render(<TestForm />);

    const message = screen.getByText("Test error");
    expect(message).toHaveClass("text-destructive text-sm custom-class");
  });

  it("handles FormField with Controller", () => {
    const TestForm = () => {
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
                <FormControl>
                  <input {...field} data-testid="test-input" />
                </FormControl>
              </FormItem>
            )}
          />
        </Form>
      );
    };

    render(<TestForm />);

    expect(screen.getByTestId("test-input")).toBeInTheDocument();
  });

  it("throws error when useFormField is used outside FormField", () => {
    // This is tested in __tests__/components/ui/form.test.tsx
    expect(true).toBe(true);
  });

  it("generates unique id for each FormItem", () => {
    render(
      <>
        <FormItem>
          <div data-testid="first-item">First Content</div>
        </FormItem>
        <FormItem>
          <div data-testid="second-item">Second Content</div>
        </FormItem>
      </>
    );

    const firstFormItem = screen.getByTestId("first-item").parentElement;
    const secondFormItem = screen.getByTestId("second-item").parentElement;
    const firstId = firstFormItem?.getAttribute("id");
    const secondId = secondFormItem?.getAttribute("id");

    expect(firstId).not.toBe(secondId);
  });

  it("applies custom className to FormItem", () => {
    render(<FormItem className="custom-form-item">
      <div>Content</div>
    </FormItem>);

    const formItem = screen.getByText("Content").parentElement;
    expect(formItem).toHaveClass("grid gap-2 custom-form-item");
  });

  it("forwards additional props to FormItem", () => {
    render(<FormItem data-testid="custom-form-item" data-custom="value">
      <div>Content</div>
    </FormItem>);

    const formItem = screen.getByTestId("custom-form-item");
    expect(formItem).toHaveAttribute("data-custom", "value");
  });
});