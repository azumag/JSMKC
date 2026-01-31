import { createMatchesPollingHandlers } from '@/lib/api-factories/matches-polling-route';

const { GET } = createMatchesPollingHandlers({
  matchModel: 'gPMatch',
  loggerName: 'gp-matches-api',
  errorMessage: 'Failed to fetch grand prix matches',
});

export { GET };
