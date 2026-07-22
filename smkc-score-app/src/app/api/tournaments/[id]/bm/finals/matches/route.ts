import { createFinalsMatchesHandlers } from '@/lib/api-factories/finals-matches-route';
import { getBmFinalsTargetWins } from '@/lib/finals-target-wins';
import { AUDIT_ACTIONS } from '@/lib/audit-log';

const { POST } = createFinalsMatchesHandlers({
  matchModel: 'bMMatch',
  loggerName: 'bm-finals-matches-api',
  getTargetWins: getBmFinalsTargetWins,
  auditAction: AUDIT_ACTIONS.CREATE_BM_MATCH,
  auditTargetType: 'BMMatch',
  sanitizeBody: true,
});

export { POST };
