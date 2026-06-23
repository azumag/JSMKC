/**
 * @jest-environment jsdom
 */

/**
 * @module Tabs Component Tests
 *
 * Unit tests for the Tabs UI component suite (Radix-based).
 * Covers:
 * - data-slot attributes on all sub-components
 * - Default active tab content visibility
 * - Inactive tab content hidden
 * - Clicking a trigger switches the active tab
 * - Disabled trigger
 * - Custom className passthrough
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const renderTabs = (defaultValue = 'tab1') =>
  render(
    <Tabs defaultValue={defaultValue}>
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">Content 1</TabsContent>
      <TabsContent value="tab2">Content 2</TabsContent>
    </Tabs>
  );

describe('Tabs', () => {
  it('TC-2767: Tabs container has data-slot="tabs"', () => {
    render(<Tabs defaultValue="a"><TabsList><TabsTrigger value="a">A</TabsTrigger></TabsList><TabsContent value="a">A</TabsContent></Tabs>);
    expect(document.querySelector('[data-slot="tabs"]')).toBeInTheDocument();
  });

  it('TC-2768: TabsList has data-slot="tabs-list"', () => {
    renderTabs();
    expect(document.querySelector('[data-slot="tabs-list"]')).toBeInTheDocument();
  });

  it('TC-2769: TabsTrigger has data-slot="tabs-trigger"', () => {
    renderTabs();
    const triggers = document.querySelectorAll('[data-slot="tabs-trigger"]');
    expect(triggers.length).toBe(2);
  });

  it('TC-2770: TabsContent has data-slot="tabs-content"', () => {
    renderTabs();
    expect(document.querySelector('[data-slot="tabs-content"]')).toBeInTheDocument();
  });

  it('TC-2771: default tab content is visible', () => {
    renderTabs('tab1');
    expect(screen.getByText('Content 1')).toBeVisible();
  });

  it('TC-2772: non-default tab content is not in the DOM initially', () => {
    renderTabs('tab1');
    // Radix does not render children for inactive tabs
    expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
  });

  it('TC-2773: clicking a trigger renders its content', async () => {
    const user = userEvent.setup();
    renderTabs('tab1');
    await user.click(screen.getByRole('tab', { name: 'Tab 2' }));
    expect(await screen.findByText('Content 2')).toBeInTheDocument();
    expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
  });

  it('TC-2774: disabled TabsTrigger has disabled attribute', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2" disabled>Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeDisabled();
  });

  it('TC-2775: custom className is forwarded to Tabs container', () => {
    render(
      <Tabs defaultValue="a" className="my-tabs">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A content</TabsContent>
      </Tabs>
    );
    expect(document.querySelector('.my-tabs')).toBeInTheDocument();
  });
});
