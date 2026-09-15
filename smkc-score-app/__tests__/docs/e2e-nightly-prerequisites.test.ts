import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'e2e-nightly.yml');
const workflowText = fs.readFileSync(workflowPath, 'utf8');
const gitignorePath = path.resolve(__dirname, '..', '..', '..', '.gitignore');
const gitignoreLines = fs.readFileSync(gitignorePath, 'utf8').split(/\r?\n/);

interface WorkflowStep {
  name?: string;
  uses?: string;
  env?: Record<string, unknown>;
  run?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
}

interface WorkflowDocument {
  jobs?: Record<string, WorkflowJob>;
}

function loadWorkflow(): WorkflowDocument {
  return parse(workflowText) as WorkflowDocument;
}

describe('nightly E2E prerequisites and diagnostics', () => {
  it('fails before checkout and dependency bootstrap when the admin profile secret is missing', () => {
    const steps = loadWorkflow().jobs?.e2e?.steps ?? [];
    const preflightIndex = steps.findIndex((step) => step.name === 'Validate admin browser profile secret');
    const checkoutIndex = steps.findIndex((step) => step.uses?.startsWith('actions/checkout@'));
    const nodeIndex = steps.findIndex((step) => step.name === 'Setup Node.js');
    const installIndex = steps.findIndex((step) => step.name === 'Install dependencies');
    const restoreProfileIndex = steps.findIndex((step) => step.name === 'Restore admin browser profile');

    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(checkoutIndex).toBeGreaterThan(preflightIndex);
    expect(nodeIndex).toBeGreaterThan(preflightIndex);
    expect(installIndex).toBeGreaterThan(preflightIndex);
    expect(restoreProfileIndex).toBeGreaterThan(preflightIndex);

    const preflight = steps[preflightIndex];
    expect(preflight.env?.PROFILE_ARCHIVE).toBe('${{ secrets.E2E_PROFILE_ARCHIVE }}');
    expect(preflight.run).toContain('if [ -z "${PROFILE_ARCHIVE}" ]; then');
    expect(preflight.run).toContain('::error::E2E_PROFILE_ARCHIVE is not configured');
    expect(preflight.run).toContain('exit 1');
    expect(preflight.run).not.toContain('echo "${PROFILE_ARCHIVE}"');
  });

  it('keeps the authenticated profile owner-only and removes its temporary archive on exit', () => {
    const steps = loadWorkflow().jobs?.e2e?.steps ?? [];
    const restoreProfile = steps.find((step) => step.name === 'Restore admin browser profile');
    const restoreScript = restoreProfile?.run ?? '';

    expect(restoreProfile?.env?.PROFILE_ARCHIVE).toBe('${{ secrets.E2E_PROFILE_ARCHIVE }}');
    expect(restoreScript).toContain('umask 077');
    expect(restoreScript).toContain('ARCHIVE_PATH="/tmp/e2e-profile-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.tar.gz"');
    expect(restoreScript).toContain('trap cleanup_profile_archive EXIT');
    expect(restoreScript).toContain('rm -f "${ARCHIVE_PATH}"');
    expect(restoreScript).toContain('printf \'%s\' "${PROFILE_ARCHIVE}" | base64 -d > "${ARCHIVE_PATH}"');
    expect(restoreScript).toContain('chmod -R go-rwx "${E2E_PROFILE_DIR}"');
    expect(restoreScript).not.toContain('echo "${PROFILE_ARCHIVE}"');
  });

  it('validates profile archive paths and member types before extracting them', () => {
    const steps = loadWorkflow().jobs?.e2e?.steps ?? [];
    const restoreProfile = steps.find((step) => step.name === 'Restore admin browser profile');
    const restoreScript = restoreProfile?.run ?? '';
    const listIndex = restoreScript.indexOf('tar -tzf "${ARCHIVE_PATH}"');
    const typeListIndex = restoreScript.indexOf('tar -tvzf "${ARCHIVE_PATH}"');
    const extractIndex = restoreScript.indexOf('tar -xzf "${ARCHIVE_PATH}" -C /tmp');

    expect(listIndex).toBeGreaterThanOrEqual(0);
    expect(typeListIndex).toBeGreaterThan(listIndex);
    expect(extractIndex).toBeGreaterThan(typeListIndex);
    expect(restoreScript).toContain('if [ -z "${ARCHIVE_ENTRIES}" ]; then');
    expect(restoreScript).toContain('PROFILE_ROOT="${E2E_PROFILE_DIR##*/}"');
    expect(restoreScript).toContain(String.raw`path ~ /^\//`);
    expect(restoreScript).toContain('parts[i] == ".."');
    expect(restoreScript).toContain('path != root && index(path, root "/") != 1');
    expect(restoreScript).toContain('contains entries outside ${PROFILE_ROOT}; refusing to extract it');
    expect(restoreScript).toContain('type = substr($1, 1, 1)');
    expect(restoreScript).toContain('type != "-" && type != "d"');
    expect(restoreScript).toContain('only regular files and directories are allowed');
  });

  it('documents a macOS/Linux-portable profile encoder instead of GNU-only base64 flags', () => {
    expect(workflowText).not.toContain('base64 -w0');
    expect(workflowText).toContain(
      `node -e "process.stdout.write(require('fs').readFileSync('profile.tar.gz').toString('base64'))" > profile.base64`,
    );
    expect(workflowText).toContain('Remove both temporary files after updating the secret');
  });

  it('ignores credential-bearing profile artifacts if they are created inside the repository', () => {
    for (const secretArtifact of ['profile.tar.gz', 'profile.base64', 'playwright-smkc-preview-profile/']) {
      expect(gitignoreLines).toContain(secretArtifact);
    }
  });

  it('expires console logs after 14 days', () => {
    const steps = loadWorkflow().jobs?.e2e?.steps ?? [];
    const uploadLog = steps.find((step) => step.name === 'Upload E2E console log');

    expect(uploadLog?.uses).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/);
    expect(uploadLog?.with?.['if-no-files-found']).toBe('ignore');
    expect(uploadLog?.with?.['retention-days']).toBe(14);
  });
});
