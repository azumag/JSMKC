import { createFinalsMatchesHandlers } from '@/lib/api-factories/finals-matches-route';
import { AUDIT_ACTIONS } from '@/lib/audit-log';

const { POST } = createFinalsMatchesHandlers({
  matchModel: 'bMMatch',
  loggerName: 'bm-finals-matches-api',
  auditAction: AUDIT_ACTIONS.CREATE_BM_MATCH,
  auditTargetType: 'BMMatch',
});

export { POST };
