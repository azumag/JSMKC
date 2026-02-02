import { createFinalsBracketHandlers } from '@/lib/api-factories/finals-bracket-route';

const { GET, POST } = createFinalsBracketHandlers({
  matchModel: 'bMMatch',
  qualificationModel: 'bMQualification',
  loggerName: 'bm-bracket-api',
  eventCode: 'BM',
});

export { GET, POST };
