import { createExportHandlers } from '@/lib/api-factories/export-route';

const { GET } = createExportHandlers({
  loggerName: 'gp-export-api',
  qualificationModel: 'gPQualification',
  matchModel: 'gPMatch',
  eventCode: 'GP',
  qualificationHeaders: ['Rank', 'Player Name', 'Nickname', 'Matches', 'Wins', 'Ties', 'Losses', 'Driver Points', 'Score'],
  qualificationRowMapper: (q, index) => [
    String(index + 1), q.player.name, q.player.nickname,
    String(q.mp), String(q.wins), String(q.ties), String(q.losses),
    String(q.points), String(q.score),
  ],
  matchHeaders: ['Match #', 'Stage', 'Cup', 'Player 1', 'Player 2', 'Points 1', 'Points 2', 'Completed'],
  matchRowMapper: (m) => [
    String(m.matchNumber), m.stage, m.cup || '-',
    `${m.player1.name} (${m.player1.nickname})`,
    `${m.player2.name} (${m.player2.nickname})`,
    String(m.points1), String(m.points2), m.completed ? 'Yes' : 'No',
  ],
});

export { GET };
