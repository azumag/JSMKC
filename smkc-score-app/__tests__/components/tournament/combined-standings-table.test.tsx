/**
 * @jest-environment jsdom
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  CombinedStandingsTable,
  type CombinedStandingsTableLabels,
} from '@/components/tournament/combined-standings-table';

describe('CombinedStandingsTable', () => {
  const combinedTieProps = {
    isAdmin: false,
    onCombinedRankOverrideSave: jest.fn(async () => true),
    onRankOverrideSave: jest.fn(async () => {}),
  };
  const labels = {
    title: 'Combined standings',
    playersCount: '2 players',
    rank: '#',
    group: 'Group',
    player: 'Player',
    mp: 'MP',
    wins: 'W',
    ties: 'T',
    losses: 'L',
    plusMinus: '+/-',
    points: 'Pts',
    qualificationPoints: 'QP',
    qualificationPointsTooltip: 'Qualification points (0-1000 normalized)',
  } satisfies CombinedStandingsTableLabels;

  function cellsByHeader(row: HTMLTableRowElement) {
    const table = row.closest('table');
    expect(table).not.toBeNull();

    const headers = within(table!)
      .getAllByRole('columnheader')
      .map((header) => {
        const text = header.textContent?.trim();
        expect(text).toBeTruthy();
        return text!;
      });
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(headers.length);

    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  }

  it('renders shared BM/MR combined standings rows', () => {
    render(
      <CombinedStandingsTable
        labels={labels}
        locale="en"
        rankings={[
          {
            id: 'q1',
            _autoRank: 1,
            combinedRankOverride: null,
            group: 'A',
            // Mario has a country, so an inline flag SVG must render in his row.
            player: { nickname: 'Mario', country: 'JP' },
            mp: 3,
            wins: 2,
            ties: 1,
            losses: 0,
            points: 5,
            score: 5,
          },
          {
            id: 'q2',
            _autoRank: 2,
            combinedRankOverride: null,
            group: 'B',
            // Luigi has no country, so his row must not render a flag.
            player: { nickname: 'Luigi' },
            mp: 3,
            wins: 1,
            ties: 0,
            losses: 2,
            points: -3,
            score: 2,
          },
        ]}
        getGroupLabel={(group) => `Group ${group}`}
        getQualificationPoints={(entry) => entry.score * 10}
        {...combinedTieProps}
      />,
    );

    expect(screen.getByText('Combined standings')).toBeInTheDocument();
    expect(screen.getByText('2 players')).toBeInTheDocument();

    const marioRow = screen.getByText('Mario').closest('tr');
    expect(marioRow).not.toBeNull();
    const marioCells = cellsByHeader(marioRow!);
    expect(marioCells['#']).toHaveTextContent('1');
    expect(marioCells['W']).toHaveTextContent('2');
    expect(marioCells['T']).toHaveTextContent('1');
    expect(marioCells.Group).toHaveTextContent('Group A');
    expect(marioCells['+/-']).toHaveTextContent('+5');
    expect(marioCells.QP).toHaveTextContent('50');
    expect(screen.getByRole('columnheader', { name: 'QP' })).toHaveAttribute(
      'title',
      'Qualification points (0-1000 normalized)',
    );

    // A country renders an inline flag image (localized country name as its
    // title/alt) immediately before the nickname.
    expect(within(marioCells.Player).getByTitle('Japan')).toBeInTheDocument();
    expect(marioCells.Player.querySelector('img')).not.toBeNull();

    const luigiRow = screen.getByText('Luigi').closest('tr');
    expect(luigiRow).not.toBeNull();
    const luigiCells = cellsByHeader(luigiRow!);
    expect(luigiCells.Group).toHaveTextContent('Group B');
    expect(luigiCells['+/-']).toHaveTextContent('-3');
    expect(luigiCells.QP).toHaveTextContent('20');
    // No country → no flag image rendered.
    expect(luigiCells.Player.querySelector('img')).toBeNull();
  });

  it('renders zero points without a plus sign', () => {
    render(
      <CombinedStandingsTable
        labels={labels}
        locale="en"
        rankings={[
          {
            id: 'q-zero',
            _autoRank: 1,
            combinedRankOverride: null,
            group: 'A',
            player: { nickname: 'Peach' },
            mp: 0,
            wins: 0,
            ties: 0,
            losses: 0,
            points: 0,
            score: 0,
          },
        ]}
        getGroupLabel={(group) => `Group ${group}`}
        getQualificationPoints={(entry) => entry.score}
        {...combinedTieProps}
      />,
    );

    const peachRow = screen.getByText('Peach').closest('tr');
    expect(peachRow).not.toBeNull();
    expect(within(peachRow!).queryByText('+0')).not.toBeInTheDocument();
    const peachCells = cellsByHeader(peachRow!);
    expect(peachCells['+/-']).toHaveTextContent('0');
    expect(peachCells.Pts).toHaveTextContent('0');
    expect(peachCells.QP).toHaveTextContent('0');
  });

  it('renders no data rows when rankings is empty', () => {
    const { container } = render(
      <CombinedStandingsTable
        labels={{ ...labels, playersCount: '0 players' }}
        locale="en"
        rankings={[]}
        getGroupLabel={(group) => `Group ${group}`}
        getQualificationPoints={(entry) => entry.score}
        {...combinedTieProps}
      />,
    );

    expect(screen.getByText('Combined standings')).toBeInTheDocument();
    expect(screen.getByText('0 players')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  // TC-3020 through TC-3022: the rank column reuses RankCell so a resolved
  // cross-group sudden-death playoff gets the same amber "completed" badge,
  // and an admin can edit or clear it — mirroring the in-group RankCell UX
  // that combinedRankOverride previously lacked entirely.
  const baseEntry = {
    id: 'q1',
    _autoRank: 1,
    group: 'A',
    player: { nickname: 'Mario' },
    mp: 3,
    wins: 2,
    ties: 1,
    losses: 0,
    points: 5,
    score: 5,
  };

  it('TC-3020: shows the auto rank with no badge when combinedRankOverride is null', () => {
    render(
      <CombinedStandingsTable
        labels={labels}
        locale="en"
        rankings={[{ ...baseEntry, combinedRankOverride: null }]}
        getGroupLabel={(group) => `Group ${group}`}
        getQualificationPoints={(entry) => entry.score}
        {...combinedTieProps}
      />,
    );

    const row = screen.getByText('Mario').closest('tr');
    const cells = cellsByHeader(row!);
    expect(cells['#']).toHaveTextContent('1');
    expect(screen.queryByRole('button', { name: 'Edit rank' })).toBeNull();
  });

  it('TC-3021: shows the amber override badge instead of the auto rank when combinedRankOverride is set', () => {
    render(
      <CombinedStandingsTable
        labels={labels}
        locale="en"
        rankings={[{ ...baseEntry, _autoRank: 4, combinedRankOverride: 1 }]}
        getGroupLabel={(group) => `Group ${group}`}
        getQualificationPoints={(entry) => entry.score}
        {...combinedTieProps}
      />,
    );

    const row = screen.getByText('Mario').closest('tr');
    const cells = cellsByHeader(row!);
    expect(cells['#']).toHaveTextContent('1');
    expect(cells['#']).not.toHaveTextContent('4');
  });

  it('TC-3022: admin can clear a resolved combinedRankOverride via the RankCell ✕ control', async () => {
    const onRankOverrideSave = jest.fn(async () => {});
    render(
      <CombinedStandingsTable
        labels={labels}
        locale="en"
        rankings={[{ ...baseEntry, combinedRankOverride: 2 }]}
        getGroupLabel={(group) => `Group ${group}`}
        getQualificationPoints={(entry) => entry.score}
        {...combinedTieProps}
        isAdmin={true}
        onRankOverrideSave={onRankOverrideSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /✕/ }));
    });

    expect(onRankOverrideSave).toHaveBeenCalledWith('q1', null);
  });
});
