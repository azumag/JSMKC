import * as React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
} from "@/components/ui/select";

// Mock lucide-react icons
jest.mock("lucide-react", () => ({
  CheckIcon: () => <span data-testid="check-icon">CheckIcon</span>,
  ChevronDownIcon: () => <span data-testid="chevron-down-icon">ChevronDownIcon</span>,
  ChevronUpIcon: () => <span data-testid="chevron-up-icon">ChevronUpIcon</span>,
}));

// Mock Radix UI primitives
jest.mock("@radix-ui/react-select", () => {
  const mockOnValueChange = jest.fn();
  const mockOnOpenChange = jest.fn();
  
  return {
    Root: ({ children, value, onValueChange, defaultValue, open, onOpenChange, ...props }: any) => {
      const finalValue = value || defaultValue;
      const finalOpen = open || false;
      
      return (
        <div 
          data-testid="select-root" 
          data-value={finalValue} 
          data-open={finalOpen} 
          {...props}
        >
          {children}
        </div>
      );
    },
    Trigger: ({ children, className, ...props }: any) => (
      <button 
        data-testid="select-trigger" 
        className={className}
        {...props}
      >
        {children}
      </button>
    ),
    Value: ({ children, placeholder, ...props }: any) => (
      <span data-testid="select-value" {...props}>
        {children || placeholder}
      </span>
    ),
    Content: ({ children, className, position, align, ...props }: any) => (
      <div 
        data-testid="select-content" 
        className={className}
        data-position={position}
        data-align={align}
        {...props}
      >
        {children}
      </div>
    ),
    Group: ({ children, ...props }: any) => (
      <div data-testid="select-group" {...props}>
        {children}
      </div>
    ),
    Label: ({ children, className, ...props }: any) => (
      <div data-testid="select-label" className={className} {...props}>
        {children}
      </div>
    ),
    Item: ({ children, value, disabled, ...props }: any) => (
      <div 
        data-testid="select-item" 
        data-value={value}
        data-disabled={disabled}
        {...props}
      >
        {children}
      </div>
    ),
    ItemIndicator: ({ children, ...props }: any) => (
      <span {...props}>{children}</span>
    ),
    ItemText: ({ children, ...props }: any) => (
      <span {...props}>{children}</span>
    ),
    Separator: ({ className, ...props }: any) => (
      <div data-testid="select-separator" className={className} {...props} />
    ),
    ScrollUpButton: ({ children, className, ...props }: any) => (
      <div data-testid="select-scroll-up-button" className={className} {...props}>
        {children}
      </div>
    ),
    ScrollDownButton: ({ children, className, ...props }: any) => (
      <div data-testid="select-scroll-down-button" className={className} {...props}>
        {children}
      </div>
    ),
    Viewport: ({ children, className, ...props }: any) => (
      <div data-testid="select-viewport" className={className} {...props}>
        {children}
      </div>
    ),
    Portal: ({ children, ...props }: any) => (
      <div data-testid="select-portal" {...props}>
        {children}
      </div>
    ),
    Icon: ({ asChild, children, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  };
});

// Mock cn utility
jest.mock("@/lib/utils", () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(" "),
}));

describe("Select", () => {
  const mockOnValueChange = jest.fn();
  const mockOnOpenChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders Select with default value", () => {
    render(
      <Select defaultValue="option1" onValueChange={mockOnValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByTestId("select-root")).toHaveAttribute("data-value", "option1");
    expect(screen.getByTestId("select-value")).toHaveTextContent("Option 1");
  });

  it("renders Select with placeholder when no value", () => {
    render(
      <Select onValueChange={mockOnValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByTestId("select-value")).toHaveTextContent("Select an option");
  });

  it("opens select when trigger is clicked", () => {
    render(
      <Select onValueChange={mockOnValueChange} onOpenChange={mockOnOpenChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByTestId("select-root")).not.toHaveAttribute("data-open", "true");

    fireEvent.click(screen.getByTestId("select-trigger"));

    expect(mockOnOpenChange).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("select-root")).toHaveAttribute("data-open", "true");
  });

  it("calls onValueChange when item is selected", () => {
    render(
      <Select onValueChange={mockOnValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    // Open select
    fireEvent.click(screen.getByTestId("select-trigger"));
    
    // Select first option
    fireEvent.click(screen.getAllByTestId("select-item")[0]);

    expect(mockOnValueChange).toHaveBeenCalledWith("option1");
  });

  it("disables select when disabled prop is passed", () => {
    render(
      <Select disabled onValueChange={mockOnValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByTestId("select-trigger");
    expect(trigger).toHaveAttribute("disabled");
    expect(trigger).toHaveClass("disabled:cursor-not-allowed disabled:opacity-50");
  });

  it("disables individual items", () => {
    render(
      <Select onValueChange={mockOnValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2" disabled>Option 2 (Disabled)</SelectItem>
        </SelectContent>
      </Select>
    );

    const items = screen.getAllByTestId("select-item");
    const enabledItem = items[0];
    const disabledItem = items[1];

    expect(enabledItem).not.toHaveAttribute("data-disabled", "true");
    expect(disabledItem).toHaveAttribute("data-disabled", "true");
  });

  it("does not call onValueChange for disabled items", () => {
    render(
      <Select onValueChange={mockOnValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2" disabled>Option 2 (Disabled)</SelectItem>
        </SelectContent>
      </Select>
    );

    // Open select
    fireEvent.click(screen.getByTestId("select-trigger"));
    
    // Try to select disabled item
    fireEvent.click(screen.getAllByTestId("select-item")[1]);

    expect(mockOnValueChange).not.toHaveBeenCalled();
  });

  it("renders SelectGroup and SelectLabel", () => {
    render(
      <Select onValueChange={mockOnValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Group Label</SelectLabel>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );

    expect(screen.getByTestId("select-group")).toBeInTheDocument();
    expect(screen.getByTestId("select-label")).toHaveTextContent("Group Label");
  });

  it("renders SelectSeparator", () => {
    render(
      <Select onValueChange={mockOnValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectSeparator />
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByTestId("select-separator")).toBeInTheDocument();
  });

  it("applies custom className to SelectTrigger", () => {
    render(
      <Select onValueChange={mockOnValueChange}>
        <SelectTrigger className="custom-trigger">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByTestId("select-trigger");
    expect(trigger).toHaveClass("custom-trigger");
  });

  it("applies custom size to SelectTrigger", () => {
    render(
      <Select onValueChange={mockOnValueChange}>
        <SelectTrigger size="sm">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByTestId("select-trigger");
    expect(trigger).toHaveAttribute("data-size", "sm");
  });

  it("applies position and align props to SelectContent", () => {
    render(
      <Select onValueChange={mockOnValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const content = screen.getByTestId("select-content");
    expect(content).toHaveAttribute("data-position", "popper");
    expect(content).toHaveAttribute("data-align", "start");
  });

  it("renders scroll buttons when content is scrollable", () => {
    render(
      <Select onValueChange={mockOnValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectScrollUpButton />
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectScrollDownButton />
        </SelectContent>
      </Select>
    );

    const scrollButtons = screen.getAllByTestId("select-scroll-up-button");
    expect(scrollButtons.length).toBeGreaterThan(0);
    expect(screen.getByTestId("select-scroll-down-button")).toBeInTheDocument();
  });

  it("closes select when clicking outside", () => {
    render(
      <Select onValueChange={mockOnValueChange} onOpenChange={mockOnOpenChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    // Open select
    fireEvent.click(screen.getByTestId("select-trigger"));
    expect(screen.getByTestId("select-root")).toHaveAttribute("data-open", "true");

    // Click outside
    fireEvent.click(document.body);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("select-root")).not.toHaveAttribute("data-open", "true");
  });

  it("supports controlled value", () => {
    const { rerender } = render(
      <Select value="option1" onValueChange={mockOnValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByTestId("select-root")).toHaveAttribute("data-value", "option1");

    // Change value
    rerender(
      <Select value="option2" onValueChange={mockOnValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByTestId("select-root")).toHaveAttribute("data-value", "option2");
  });

  it("applies data attributes to root element", () => {
    render(
      <Select data-testid="custom-select" data-custom="value">
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const selectRoot = screen.getByTestId("custom-select");
    expect(selectRoot).toHaveAttribute("data-custom", "value");
  });
});