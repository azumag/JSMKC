/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";

import { CountrySelect } from "@/components/ui/country-select";

describe("CountrySelect", () => {
  it("shows the localized name for a stored ISO code, with a flag preview", () => {
    const { container } = render(
      <CountrySelect value="JP" locale="ja" onChange={() => {}} />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("日本");
    expect(container.querySelector("img")?.getAttribute("title")).toBe("日本");
  });

  it("resolves a legacy free-text name to its localized name", () => {
    render(<CountrySelect value="Norway" locale="en" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveValue("Norway");
  });

  it("emits the ISO code when a full country name is entered", () => {
    const onChange = jest.fn();
    render(<CountrySelect value="" locale="en" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Japan" },
    });
    expect(onChange).toHaveBeenLastCalledWith("JP");
  });

  it("passes raw text through while it does not match a country", () => {
    const onChange = jest.fn();
    render(<CountrySelect value="" locale="en" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Jap" } });
    expect(onChange).toHaveBeenLastCalledWith("Jap");
  });

  it("offers a datalist of country options", () => {
    const { container } = render(
      <CountrySelect value="" locale="en" onChange={() => {}} />,
    );
    const options = container.querySelectorAll("datalist option");
    expect(options.length).toBeGreaterThan(200);
  });
});
