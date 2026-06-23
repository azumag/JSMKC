/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

describe('Table', () => {
  it('TC-2821: Table renders a container div with data-slot="table-container"', () => {
    const { container } = render(<Table />);
    const wrapper = container.querySelector('[data-slot="table-container"]');
    expect(wrapper).toBeInTheDocument();
  });

  it('TC-2822: Table renders an inner <table> with data-slot="table"', () => {
    const { container } = render(<Table />);
    const table = container.querySelector('[data-slot="table"]');
    expect(table).toBeInTheDocument();
    expect(table?.tagName).toBe('TABLE');
  });

  it('TC-2823: Table forwards custom className to the <table> element', () => {
    const { container } = render(<Table className="my-table" />);
    const table = container.querySelector('[data-slot="table"]');
    expect(table).toHaveClass('my-table');
  });

  it('TC-2824: Table renders children', () => {
    render(<Table><TableBody><TableRow><TableCell>hello</TableCell></TableRow></TableBody></Table>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('TC-2825: TableHeader renders a <thead> with data-slot="table-header"', () => {
    const { container } = render(<Table><TableHeader /></Table>);
    const thead = container.querySelector('[data-slot="table-header"]');
    expect(thead).toBeInTheDocument();
    expect(thead?.tagName).toBe('THEAD');
  });

  it('TC-2826: TableHeader forwards custom className', () => {
    const { container } = render(<Table><TableHeader className="my-thead" /></Table>);
    expect(container.querySelector('[data-slot="table-header"]')).toHaveClass('my-thead');
  });

  it('TC-2827: TableBody renders a <tbody> with data-slot="table-body"', () => {
    const { container } = render(<Table><TableBody /></Table>);
    const tbody = container.querySelector('[data-slot="table-body"]');
    expect(tbody).toBeInTheDocument();
    expect(tbody?.tagName).toBe('TBODY');
  });

  it('TC-2828: TableBody forwards custom className', () => {
    const { container } = render(<Table><TableBody className="my-tbody" /></Table>);
    expect(container.querySelector('[data-slot="table-body"]')).toHaveClass('my-tbody');
  });

  it('TC-2829: TableFooter renders a <tfoot> with data-slot="table-footer"', () => {
    const { container } = render(<Table><TableFooter /></Table>);
    const tfoot = container.querySelector('[data-slot="table-footer"]');
    expect(tfoot).toBeInTheDocument();
    expect(tfoot?.tagName).toBe('TFOOT');
  });

  it('TC-2830: TableFooter forwards custom className', () => {
    const { container } = render(<Table><TableFooter className="my-tfoot" /></Table>);
    expect(container.querySelector('[data-slot="table-footer"]')).toHaveClass('my-tfoot');
  });

  it('TC-2831: TableRow renders a <tr> with data-slot="table-row"', () => {
    const { container } = render(
      <Table><TableBody><TableRow /></TableBody></Table>
    );
    const tr = container.querySelector('[data-slot="table-row"]');
    expect(tr).toBeInTheDocument();
    expect(tr?.tagName).toBe('TR');
  });

  it('TC-2832: TableRow forwards custom className', () => {
    const { container } = render(
      <Table><TableBody><TableRow className="my-row" /></TableBody></Table>
    );
    expect(container.querySelector('[data-slot="table-row"]')).toHaveClass('my-row');
  });

  it('TC-2833: TableHead renders a <th> with data-slot="table-head"', () => {
    const { container } = render(
      <Table><TableHeader><TableRow><TableHead>Col</TableHead></TableRow></TableHeader></Table>
    );
    const th = container.querySelector('[data-slot="table-head"]');
    expect(th).toBeInTheDocument();
    expect(th?.tagName).toBe('TH');
    expect(screen.getByText('Col')).toBeInTheDocument();
  });

  it('TC-2834: TableHead forwards custom className', () => {
    const { container } = render(
      <Table><TableHeader><TableRow><TableHead className="my-th" /></TableRow></TableHeader></Table>
    );
    expect(container.querySelector('[data-slot="table-head"]')).toHaveClass('my-th');
  });

  it('TC-2835: TableCell renders a <td> with data-slot="table-cell"', () => {
    const { container } = render(
      <Table><TableBody><TableRow><TableCell>value</TableCell></TableRow></TableBody></Table>
    );
    const td = container.querySelector('[data-slot="table-cell"]');
    expect(td).toBeInTheDocument();
    expect(td?.tagName).toBe('TD');
    expect(screen.getByText('value')).toBeInTheDocument();
  });

  it('TC-2836: TableCell forwards custom className', () => {
    const { container } = render(
      <Table><TableBody><TableRow><TableCell className="my-td" /></TableRow></TableBody></Table>
    );
    expect(container.querySelector('[data-slot="table-cell"]')).toHaveClass('my-td');
  });

  it('TC-2837: TableCaption renders a <caption> with data-slot="table-caption"', () => {
    const { container } = render(<Table><TableCaption>Score table</TableCaption></Table>);
    const caption = container.querySelector('[data-slot="table-caption"]');
    expect(caption).toBeInTheDocument();
    expect(caption?.tagName).toBe('CAPTION');
    expect(screen.getByText('Score table')).toBeInTheDocument();
  });

  it('TC-2838: TableCaption forwards custom className', () => {
    const { container } = render(<Table><TableCaption className="my-caption" /></Table>);
    expect(container.querySelector('[data-slot="table-caption"]')).toHaveClass('my-caption');
  });

  it('TC-2839: integration — full Table with all subcomponents renders expected content', () => {
    render(
      <Table>
        <TableCaption>Player Standings</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <TableHead>Player</TableHead>
            <TableHead>Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>1</TableCell>
            <TableCell>Alice</TableCell>
            <TableCell>100</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>2</TableCell>
            <TableCell>Bob</TableCell>
            <TableCell>90</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>Total: 2 players</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );
    expect(screen.getByText('Player Standings')).toBeInTheDocument();
    expect(screen.getByText('Rank')).toBeInTheDocument();
    expect(screen.getByText('Player')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Total: 2 players')).toBeInTheDocument();
  });
});
