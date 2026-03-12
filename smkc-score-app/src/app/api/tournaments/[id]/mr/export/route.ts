import { createExportHandlers } from '@/lib/api-factories/export-route';

const { GET } = createExportHandlers({
  loggerName: 'mr-export-api',
  qualificationModel: 'mRQualification',
  matchModel: 'mRMatch',
  eventCode: 'MR',
  qualificationHeaders: ['Rank', 'Player Name', 'Nickname', 'Matches', 'Wins', 'Ties', 'Losses', 'Points', 'Score'],
  qualificationRowMapper: (q, index) => [
    String(index + 1), q.player.name, q.player.nickname,
    String(q.mp), String(q.wins), String(q.ties), String(q.losses),
    String(q.points), String(q.score),
  ],
  matchHeaders: ['Match #', 'Stage', 'Player 1', 'Player 2', 'Score 1', 'Score 2', 'Completed'],
  matchRowMapper: (m) => [
    String(m.matchNumber), m.stage,
    `${m.player1.name} (${m.player1.nickname})`,
    `${m.player2.name} (${m.player2.nickname})`,
    String(m.score1), String(m.score2), m.completed ? 'Yes' : 'No',
  ],
});

export { GET };
