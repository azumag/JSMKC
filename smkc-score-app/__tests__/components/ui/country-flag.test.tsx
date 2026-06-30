/**
 * @jest-environment jsdom
 */
import { render } from "@testing-library/react";

import { CountryFlag } from "@/components/ui/country-flag";

function flag(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector("img");
}

describe("CountryFlag", () => {
  it("renders the flag image with the localized name and code src for an ISO code", () => {
    const { container } = render(<CountryFlag country="JP" locale="ja" />);
    const img = flag(container);
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/flags/jp.svg");
    expect(img).toHaveAttribute("title", "日本");
    expect(img).toHaveAttribute("alt", "日本");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("uses the English name when locale is en", () => {
    const { container } = render(<CountryFlag country="JP" locale="en" />);
    expect(flag(container)).toHaveAttribute("title", "Japan");
  });

  it("resolves a legacy free-text country name to its flag", () => {
    const { container } = render(<CountryFlag country="Norway" locale="en" />);
    expect(flag(container)).toHaveAttribute("src", "/flags/no.svg");
    expect(flag(container)).toHaveAttribute("title", "Norway");
  });

  it("renders nothing for empty or unknown country", () => {
    expect(flag(render(<CountryFlag country={null} />).container)).toBeNull();
    expect(flag(render(<CountryFlag country="" />).container)).toBeNull();
    expect(flag(render(<CountryFlag country="Nowhereland" />).container)).toBeNull();
  });
});
