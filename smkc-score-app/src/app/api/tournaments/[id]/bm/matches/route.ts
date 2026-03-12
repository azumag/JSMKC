import { createMatchesPollingHandlers } from '@/lib/api-factories/matches-polling-route';

const { GET } = createMatchesPollingHandlers({
  matchModel: 'bMMatch',
  loggerName: 'bm-matches-api',
  errorMessage: 'Failed to fetch battle mode matches',
});

export { GET };
