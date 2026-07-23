import { createFinalsMatchesHandlers } from '@/lib/api-factories/finals-matches-route';
import { getMrFinalsTargetWins } from '@/lib/finals-target-wins';
import { AUDIT_ACTIONS } from '@/lib/audit-log';

const { POST } = createFinalsMatchesHandlers({
  matchModel: 'mRMatch',
  loggerName: 'mr-finals-matches-api',
  getTargetWins: getMrFinalsTargetWins,
  auditAction: AUDIT_ACTIONS.CREATE_MR_MATCH,
  auditTargetType: 'MRMatch',
  sanitizeBody: true,
});

export { POST };
