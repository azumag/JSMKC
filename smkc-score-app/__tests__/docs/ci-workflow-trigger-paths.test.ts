import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface TriggerConfig {
  paths?: string[];
}

interface CiWorkflow {
  on?: {
    push?: TriggerConfig;
    pull_request?: TriggerConfig;
  };
}

describe('CI workflow trigger paths', () => {
  it('runs standard validation for app and workflow changes', () => {
    const ciPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'ci.yml');
    const workflow = parse(fs.readFileSync(ciPath, 'utf8')) as CiWorkflow;
    const expectedPaths = ['smkc-score-app/**', '.github/workflows/**'];

    expect(workflow.on?.push?.paths).toEqual(expect.arrayContaining(expectedPaths));
    expect(workflow.on?.pull_request?.paths).toEqual(expect.arrayContaining(expectedPaths));
  });
});
