import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

const REVIEWED_CACHE_V5_SHA = 'caa296126883cff596d87d8935842f9db880ef25';
const BROWSER_HOME = '/tmp/playwright-e2e-home';
const BROWSER_CACHE = `${BROWSER_HOME}/ms-playwright`;

interface WorkflowStep {
  id?: string;
  name?: string;
  uses?: string;
  if?: string;
  run?: string;
  with?: Record<string, unknown>;
  ['working-directory']?: string;
}

interface WorkflowJob {
  env?: Record<string, unknown>;
  steps?: WorkflowStep[];
}

interface WorkflowDocument {
  jobs?: Record<string, WorkflowJob>;
}

const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'e2e-nightly.yml');

function loadWorkflow(): WorkflowDocument {
  return parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowDocument;
}

describe('nightly E2E Playwright browser cache', () => {
  it('restores, installs, and saves the exact runtime browser directory before the E2E suite', () => {
    const workflow = loadWorkflow();
    const job = workflow.jobs?.e2e;
    const steps = job?.steps ?? [];

    expect(job?.env?.E2E_BROWSER_HOME).toBe(BROWSER_HOME);

    const restoreIndex = steps.findIndex((step) => step.name === 'Restore Playwright browser cache');
    const installIndex = steps.findIndex((step) => step.name === 'Ensure Playwright browser is installed');
    const saveIndex = steps.findIndex((step) => step.name === 'Save Playwright browser cache');
    const e2eIndex = steps.findIndex((step) => step.name === 'Run E2E suite');

    expect(restoreIndex).toBeGreaterThanOrEqual(0);
    expect(installIndex).toBeGreaterThan(restoreIndex);
    expect(saveIndex).toBeGreaterThan(installIndex);
    expect(e2eIndex).toBeGreaterThan(saveIndex);

    const restore = steps[restoreIndex];
    expect(restore.id).toBe('playwright-browser-cache');
    expect(restore.uses).toBe(`actions/cache/restore@${REVIEWED_CACHE_V5_SHA}`);
    expect(restore.with?.path).toBe(BROWSER_CACHE);
    expect(restore.with?.key).toBe("playwright-${{ runner.os }}-${{ hashFiles('smkc-score-app/package-lock.json') }}");
    expect(restore.with?.['restore-keys']).toBeUndefined();

    const install = steps[installIndex];
    expect(install['working-directory']).toBe('smkc-score-app');
    expect(install.run).toBe('npm run e2e:install-browser');

    const save = steps[saveIndex];
    expect(save.uses).toBe(`actions/cache/save@${REVIEWED_CACHE_V5_SHA}`);
    expect(save.if).toBe("steps.playwright-browser-cache.outputs.cache-hit != 'true'");
    expect(save.with?.path).toBe(BROWSER_CACHE);
    expect(save.with?.key).toBe('${{ steps.playwright-browser-cache.outputs.cache-primary-key }}');
  });
});
