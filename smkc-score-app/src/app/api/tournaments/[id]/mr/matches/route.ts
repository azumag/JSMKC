import { createMatchesPollingHandlers } from '@/lib/api-factories/matches-polling-route';

const { GET } = createMatchesPollingHandlers({
  matchModel: 'mRMatch',
  loggerName: 'mr-matches-api',
  errorMessage: 'Failed to fetch match race matches',
});

export { GET };
