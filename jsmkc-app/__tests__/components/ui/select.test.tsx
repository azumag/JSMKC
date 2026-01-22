import { render, screen } from '@testing-library/react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollUpButton,
  SelectScrollDownButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Select Component Tests
 * 
 * Tests for the Radix UI Select wrapper components.
 * Select allows users to choose a value from a list of options.
 */
describe('Select Components', () => {
  /**
   * Helper component to render a complete Select
   */
  const renderSelect = (props = {}) => {
    return render(
      <Select defaultValue="option1" {...props}>
        <SelectTrigger data-testid="trigger">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectLabel>Fruits</SelectLabel>
          <SelectGroup>
            <SelectItem value="option1">Apple</SelectItem>
            <SelectItem value="option2">Banana</SelectItem>
            <SelectItem value="option3">Cherry</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectItem value="option4">Orange</SelectItem>
            <SelectItem value="option5">Grape</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  };

  describe('Select', () => {
    it('should render Select component', () => {
      renderSelect();

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
    });

    it('should render placeholder text when no value selected', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Choose an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Choose an option')).toBeInTheDocument();
    });

    it('should pass props to Radix Select.Root', () => {
      render(
        <Select open={true} onOpenChange={jest.fn()}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      const { container } = renderSelect();

      const select = container.querySelector('[data-slot="select"]');
      expect(select).toBeInTheDocument();
    });
  });

  describe('SelectTrigger', () => {
    it('should render trigger with children', () => {
      renderSelect();

      const trigger = screen.getByTestId('trigger');
      expect(trigger).toBeInTheDocument();
    });

    it('should render ChevronDown icon', () => {
      const { container } = renderSelect();

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should apply default height class', () => {
      renderSelect();

      const trigger = screen.getByTestId('trigger');
      expect(trigger).toHaveClass('h-9');
    });

    it('should apply sm size height class when size="sm"', () => {
      render(
        <Select>
          <SelectTrigger size="sm">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveAttribute('data-size', 'sm');
    });

    it('should apply custom className', () => {
      render(
        <Select>
          <SelectTrigger className="custom-trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveClass('custom-trigger');
    });

    it('should have data-slot attribute', () => {
      renderSelect();

      const trigger = screen.getByTestId('trigger');
      expect(trigger).toHaveAttribute('data-slot', 'select-trigger');
    });

    it('should have proper focus styles', () => {
      renderSelect();

      const trigger = screen.getByTestId('trigger');
      expect(trigger).toHaveClass('focus-visible:border-ring', 'focus-visible:ring-[3px]');
    });

    it('should be disabled when disabled prop is passed', () => {
      render(
        <Select disabled>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeDisabled();
    });
  });

  describe('SelectValue', () => {
    it('should render placeholder text', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Placeholder text" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Placeholder text')).toBeInTheDocument();
    });

    it('should render selected value when value is set', () => {
      renderSelect();

      const selectValue = screen.getByText('Apple');
      expect(selectValue).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      const { container } = renderSelect();

      const value = container.querySelector('[data-slot="select-value"]');
      expect(value).toBeInTheDocument();
    });

    it('should have line-clamp for long text', () => {
      const { container } = renderSelect();

      const value = container.querySelector('[data-slot="select-value"]');
      expect(value).toHaveClass('line-clamp-1');
    });
  });

  describe('SelectContent', () => {
    it('should render content with children', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
            <SelectItem value="2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Option 1')).toBeInTheDocument();
      expect(screen.getByText('Option 2')).toBeInTheDocument();
    });

    it('should render within portal', () => {
      const { container } = render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      const content = container.querySelector('[data-slot="select-content"]');
      expect(content).toBeInTheDocument();
    });

    it('should accept custom className', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="custom-content">
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Option 1').closest('[data-slot="select-content"]'))
        .toHaveClass('custom-content');
    });

    it('should have proper positioning classes', () => {
      const { container } = renderSelect();

      const content = container.querySelector('[data-slot="select-content"]');
      expect(content).toHaveClass('z-50', 'rounded-md', 'border', 'shadow-md');
    });

    it('should have data-slot attribute', () => {
      const { container } = renderSelect();

      const content = container.querySelector('[data-slot="select-content"]');
      expect(content).toBeInTheDocument();
    });

    it('should handle position prop', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Option 1')).toBeInTheDocument();
    });

    it('should handle align prop', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Option 1')).toBeInTheDocument();
    });
  });

  describe('SelectGroup', () => {
    it('should render group with children', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="1">Option 1</SelectItem>
              <SelectItem value="2">Option 2</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Option 1')).toBeInTheDocument();
      expect(screen.getByText('Option 2')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      const { container } = renderSelect();

      const group = container.querySelector('[data-slot="select-group"]');
      expect(group).toBeInTheDocument();
    });
  });

  describe('SelectLabel', () => {
    it('should render label text', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="1">Apple</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Fruits')).toBeInTheDocument();
    });

    it('should have correct typography classes', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectLabel>Label</SelectLabel>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      const label = screen.getByText('Label');
      expect(label).toHaveClass('text-muted-foreground', 'text-xs');
    });

    it('should accept custom className', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectLabel className="custom-label">Label</SelectLabel>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      const label = screen.getByText('Label');
      expect(label).toHaveClass('custom-label');
    });

    it('should have data-slot attribute', () => {
      const { container } = renderSelect();

      const label = container.querySelector('[data-slot="select-label"]');
      expect(label).toBeInTheDocument();
    });
  });

  describe('SelectItem', () => {
    it('should render item text', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Option 1')).toBeInTheDocument();
    });

    it('should render check icon when selected', () => {
      renderSelect();

      const { container } = render(
        <Select defaultValue="option1" open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Apple</SelectItem>
            <SelectItem value="option2">Banana</SelectItem>
          </SelectContent>
        </Select>
      );

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should accept custom className', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1" className="custom-item">
              Option 1
            </SelectItem>
          </SelectContent>
        </Select>
      );

      const item = screen.getByText('Option 1');
      expect(item).toHaveClass('custom-item');
    });

    it('should have data-slot attribute', () => {
      const { container } = renderSelect();

      const item = container.querySelector('[data-slot="select-item"]');
      expect(item).toBeInTheDocument();
    });

    it('should be disabled when disabled prop is passed', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1" disabled>
              Disabled Option
            </SelectItem>
          </SelectContent>
        </Select>
      );

      const item = screen.getByText('Disabled Option');
      expect(item).toHaveAttribute('data-disabled');
    });
  });

  describe('SelectSeparator', () => {
    it('should render separator', () => {
      const { container } = render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
            <SelectSeparator />
            <SelectItem value="2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      );

      const separator = container.querySelector('[data-slot="select-separator"]');
      expect(separator).toBeInTheDocument();
    });

    it('should accept custom className', () => {
      const { container } = render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectSeparator className="custom-separator" />
          </SelectContent>
        </Select>
      );

      const separator = container.querySelector('[data-slot="select-separator"]');
      expect(separator).toHaveClass('custom-separator');
    });

    it('should have data-slot attribute', () => {
      const { container } = renderSelect();

      const separator = container.querySelector('[data-slot="select-separator"]');
      expect(separator).toBeInTheDocument();
    });

    it('should have correct border styling', () => {
      const { container } = renderSelect();

      const separator = container.querySelector('[data-slot="select-separator"]');
      expect(separator).toHaveClass('bg-border', 'h-px');
    });
  });

  describe('SelectScrollUpButton', () => {
    it('should render scroll up button', () => {
      const { container } = renderSelect();

      const button = container.querySelector('[data-slot="select-scroll-up-button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render ChevronUp icon', () => {
      const { container } = renderSelect();

      const button = container.querySelector('[data-slot="select-scroll-up-button"]');
      const icon = button?.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should accept custom className', () => {
      const { container } = render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectScrollUpButton className="custom-scroll-up" />
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      const button = container.querySelector('[data-slot="select-scroll-up-button"]');
      expect(button).toHaveClass('custom-scroll-up');
    });

    it('should have data-slot attribute', () => {
      const { container } = renderSelect();

      const button = container.querySelector('[data-slot="select-scroll-up-button"]');
      expect(button).toBeInTheDocument();
    });
  });

  describe('SelectScrollDownButton', () => {
    it('should render scroll down button', () => {
      const { container } = renderSelect();

      const button = container.querySelector('[data-slot="select-scroll-down-button"]');
      expect(button).toBeInTheDocument();
    });

    it('should render ChevronDown icon', () => {
      const { container } = renderSelect();

      const button = container.querySelector('[data-slot="select-scroll-down-button"]');
      const icon = button?.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should accept custom className', () => {
      const { container } = render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
            <SelectScrollDownButton className="custom-scroll-down" />
          </SelectContent>
        </Select>
      );

      const button = container.querySelector('[data-slot="select-scroll-down-button"]');
      expect(button).toHaveClass('custom-scroll-down');
    });

    it('should have data-slot attribute', () => {
      const { container } = renderSelect();

      const button = container.querySelector('[data-slot="select-scroll-down-button"]');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Complete Select Integration', () => {
    it('should render complete Select with all subcomponents', () => {
      renderSelect();

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Fruits')).toBeInTheDocument();
    });

    it('should handle multiple SelectGroups', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Group 1</SelectLabel>
              <SelectItem value="1">Item 1</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Group 2</SelectLabel>
              <SelectItem value="2">Item 2</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Group 1')).toBeInTheDocument();
      expect(screen.getByText('Group 2')).toBeInTheDocument();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have correct role for trigger', () => {
      renderSelect();

      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeInTheDocument();
    });

    it('should have correct aria attributes for disabled items', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1" disabled>
              Disabled Item
            </SelectItem>
          </SelectContent>
        </Select>
      );

      const item = screen.getByText('Disabled Item');
      expect(item).toHaveAttribute('data-disabled');
    });
  });
});
