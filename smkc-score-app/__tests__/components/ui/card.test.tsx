/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

describe('Card', () => {
  it('TC-2802: renders with data-slot="card"', () => {
    render(<Card data-testid="card" />);
    expect(screen.getByTestId('card')).toHaveAttribute('data-slot', 'card');
  });

  it('TC-2803: forwards custom className to the root div', () => {
    render(<Card data-testid="card" className="my-card" />);
    expect(screen.getByTestId('card')).toHaveClass('my-card');
  });

  it('TC-2804: renders children', () => {
    render(<Card>Card body</Card>);
    expect(screen.getByText('Card body')).toBeInTheDocument();
  });

  it('TC-2805: CardHeader renders with data-slot="card-header"', () => {
    render(<CardHeader data-testid="header" />);
    expect(screen.getByTestId('header')).toHaveAttribute('data-slot', 'card-header');
  });

  it('TC-2806: CardHeader forwards custom className', () => {
    render(<CardHeader data-testid="header" className="my-header" />);
    expect(screen.getByTestId('header')).toHaveClass('my-header');
  });

  it('TC-2807: CardTitle renders with data-slot="card-title"', () => {
    render(<CardTitle data-testid="title">My Title</CardTitle>);
    expect(screen.getByTestId('title')).toHaveAttribute('data-slot', 'card-title');
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  it('TC-2808: CardTitle forwards custom className', () => {
    render(<CardTitle data-testid="title" className="my-title" />);
    expect(screen.getByTestId('title')).toHaveClass('my-title');
  });

  it('TC-2809: CardDescription renders with data-slot="card-description"', () => {
    render(<CardDescription data-testid="desc">Details</CardDescription>);
    expect(screen.getByTestId('desc')).toHaveAttribute('data-slot', 'card-description');
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('TC-2810: CardDescription forwards custom className', () => {
    render(<CardDescription data-testid="desc" className="my-desc" />);
    expect(screen.getByTestId('desc')).toHaveClass('my-desc');
  });

  it('TC-2811: CardAction renders with data-slot="card-action"', () => {
    render(<CardAction data-testid="action" />);
    expect(screen.getByTestId('action')).toHaveAttribute('data-slot', 'card-action');
  });

  it('TC-2812: CardAction forwards custom className', () => {
    render(<CardAction data-testid="action" className="my-action" />);
    expect(screen.getByTestId('action')).toHaveClass('my-action');
  });

  it('TC-2813: CardContent renders with data-slot="card-content"', () => {
    render(<CardContent data-testid="content">Body text</CardContent>);
    expect(screen.getByTestId('content')).toHaveAttribute('data-slot', 'card-content');
    expect(screen.getByText('Body text')).toBeInTheDocument();
  });

  it('TC-2814: CardContent forwards custom className', () => {
    render(<CardContent data-testid="content" className="my-content" />);
    expect(screen.getByTestId('content')).toHaveClass('my-content');
  });

  it('TC-2815: CardFooter renders with data-slot="card-footer"', () => {
    render(<CardFooter data-testid="footer" />);
    expect(screen.getByTestId('footer')).toHaveAttribute('data-slot', 'card-footer');
  });

  it('TC-2816: CardFooter forwards custom className', () => {
    render(<CardFooter data-testid="footer" className="my-footer" />);
    expect(screen.getByTestId('footer')).toHaveClass('my-footer');
  });

  it('TC-2817: integration — full Card with all subcomponents renders expected content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Tournament Results</CardTitle>
          <CardDescription>Final standings for 2026</CardDescription>
          <CardAction data-testid="action">Edit</CardAction>
        </CardHeader>
        <CardContent>Leaderboard content</CardContent>
        <CardFooter>Footer note</CardFooter>
      </Card>
    );
    expect(screen.getByText('Tournament Results')).toBeInTheDocument();
    expect(screen.getByText('Final standings for 2026')).toBeInTheDocument();
    expect(screen.getByText('Leaderboard content')).toBeInTheDocument();
    expect(screen.getByText('Footer note')).toBeInTheDocument();
    expect(screen.getByTestId('action')).toBeInTheDocument();
  });
});
