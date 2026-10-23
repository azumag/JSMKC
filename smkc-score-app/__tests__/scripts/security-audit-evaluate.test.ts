import { evaluateAuditReport } from '../../scripts/security-audit.js';

type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

// Builds a canonical npm audit v2 report. The metadata summary is derived from
// the vulnerability graph so that it stays consistent unless a test overrides it.
function auditReport(vulnerabilities: Record<string, { severity: Severity }>) {
  const counts: Record<Severity, number> = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  const graph: Record<string, unknown> = {};
  for (const [name, { severity }] of Object.entries(vulnerabilities)) {
    counts[severity] += 1;
    graph[name] = {
      name,
      severity,
      isDirect: false,
      via: [],
      effects: [],
      range: '*',
      nodes: [`node_modules/${name}`],
      fixAvailable: false,
    };
  }
  return {
    auditReportVersion: 2,
    vulnerabilities: graph,
    metadata: { vulnerabilities: { ...counts, total: Object.keys(vulnerabilities).length } },
  };
}

describe('security audit blocking policy', () => {
  it('passes a canonical empty report', () => {
    expect(evaluateAuditReport(auditReport({}))).toEqual({ ok: true, unexpected: [] });
  });

  it('passes when only non-blocking severities are present', () => {
    const result = evaluateAuditReport(
      auditReport({ 'low-pkg': { severity: 'low' }, 'mod-pkg': { severity: 'moderate' } }),
    );

    expect(result).toEqual({ ok: true, unexpected: [] });
  });

  it('blocks every high advisory and names it', () => {
    const result = evaluateAuditReport(
      auditReport({ 'high-pkg': { severity: 'high' }, 'mod-pkg': { severity: 'moderate' } }),
    );

    expect(result).toEqual({ ok: false, unexpected: ['high-pkg'] });
  });

  it('blocks critical advisories', () => {
    const result = evaluateAuditReport(auditReport({ 'crit-pkg': { severity: 'critical' } }));

    expect(result).toEqual({ ok: false, unexpected: ['crit-pkg'] });
  });

  it('fails closed when the summary high count disagrees with the graph', () => {
    const report = auditReport({ 'high-pkg': { severity: 'high' } });
    report.metadata.vulnerabilities.high = 2;

    expect(evaluateAuditReport(report)).toEqual({ ok: false, unexpected: ['invalid-audit-report'] });
  });
});
