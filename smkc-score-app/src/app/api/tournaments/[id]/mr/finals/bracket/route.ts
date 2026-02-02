import { createFinalsBracketHandlers } from '@/lib/api-factories/finals-bracket-route';

const { GET, POST } = createFinalsBracketHandlers({
  matchModel: 'mRMatch',
  qualificationModel: 'mRQualification',
  loggerName: 'mr-bracket-api',
  eventCode: 'MR',
});

export { GET, POST };
