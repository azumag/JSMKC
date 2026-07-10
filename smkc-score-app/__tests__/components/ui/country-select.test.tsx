/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, within } from "@testing-library/react";

import { CountrySelect } from "@/components/ui/country-select";

describe("CountrySelect (searchable pulldown)", () => {
  it("shows the localized name and a flag on the trigger for a stored code", () => {
    render(<CountrySelect value="JP" locale="ja" onChange={() => {}} />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("日本");
    expect(trigger.querySelector("img")?.getAttribute("title")).toBe("日本");
  });

  it("resolves a legacy free-text name onto the trigger", () => {
    render(<CountrySelect value="Norway" locale="en" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Norway");
  });

  it("opens a searchable list and emits the ISO code on pick", () => {
    const onChange = jest.fn();
    render(<CountrySelect value="" locale="en" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));

    // Search box appears; filter to Norway and pick it.
    const search = screen.getByLabelText("Search countries");
    fireEvent.change(search, { target: { value: "norw" } });
    const list = screen.getByRole("listbox");
    const norway = within(list).getByText("Norway");
    fireEvent.click(norway);

    expect(onChange).toHaveBeenLastCalledWith("NO");
  });

  it("filters the list as the query narrows", () => {
    render(<CountrySelect value="" locale="en" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    const list = screen.getByRole("listbox");
    const before = within(list).getAllByRole("option").length;
    fireEvent.change(screen.getByLabelText("Search countries"), {
      target: { value: "japan" },
    });
    const after = within(list).getAllByRole("option").length;
    expect(before).toBeGreaterThan(200);
    expect(after).toBe(1);
    expect(within(list).getByText("Japan")).toBeInTheDocument();
  });

  it("can clear the selection (emits empty string)", () => {
    const onChange = jest.fn();
    render(<CountrySelect value="JP" locale="en" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    // The first row is the clear ("—") option.
    fireEvent.click(screen.getByText("—"));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("moves the active option with arrow keys and selects it with Enter", () => {
    const onChange = jest.fn();
    render(<CountrySelect value="" locale="en" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));

    const search = screen.getByRole("combobox", { name: "Search countries" });
    fireEvent.change(search, { target: { value: "japan" } });
    fireEvent.keyDown(search, { key: "ArrowDown" });

    const japan = screen.getByRole("option", { name: /Japan/ });
    expect(search).toHaveAttribute("aria-activedescendant", japan.id);
    expect(japan).toHaveClass("bg-accent");

    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("JP");
  });

  it("supports ArrowUp, Home, End, and Escape navigation", () => {
    render(<CountrySelect value="" locale="en" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    const search = screen.getByRole("combobox", { name: "Search countries" });
    fireEvent.change(search, { target: { value: "nor" } });
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(1);

    fireEvent.keyDown(search, { key: "ArrowUp" });
    expect(search).toHaveAttribute("aria-activedescendant", options.at(-1)?.id);
    fireEvent.keyDown(search, { key: "Home" });
    expect(search).toHaveAttribute("aria-activedescendant", options[0].id);
    fireEvent.keyDown(search, { key: "End" });
    expect(search).toHaveAttribute("aria-activedescendant", options.at(-1)?.id);

    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByLabelText("Search countries")).not.toBeInTheDocument();
  });
});
