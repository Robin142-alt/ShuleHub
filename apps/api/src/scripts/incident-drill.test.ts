import assert from 'node:assert/strict';
import test from 'node:test';

import { runIncidentDrill } from './incident-drill';

test('runIncidentDrill passes when runbooks and workflow contain operability evidence', () => {
  const result = runIncidentDrill({
    dryRun: true,
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceOverrides: buildPassingSources(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.checks.every((check) => check.status === 'pass'), true);
});

test('runIncidentDrill fails when provider playbooks are missing', () => {
  const sources = buildPassingSources();
  sources['docs/runbooks/incident-response.md'] = 'Incident drill checklist with incident commander severity rollback decision communications checkpoint evidence closeout';

  const result = runIncidentDrill({
    dryRun: true,
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceOverrides: sources,
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.id === 'provider-playbooks')?.status, 'fail');
});

function buildPassingSources(): Record<string, string> {
  const incidentRunbook = `
# Incident Response
## Incident Drill Checklist
- Incident commander assigned
- Severity confirmed
- Rollback decision recorded
- Communications checkpoint completed
- Evidence captured
- Closeout completed
## Provider Outage Playbooks
### Email outage
Primary owner: Support lead
### SMS provider outage
Primary owner: Platform owner
### Daraja outage
Primary owner: Finance operations
### Redis outage
Primary owner: Engineering
### Postgres outage
Primary owner: Engineering
### Object storage outage
Primary owner: Engineering
### Malware scanner outage
Primary owner: Security owner
## Dependency Ownership Matrix
Email owner Support lead
SMS provider owner Platform owner
Daraja owner Finance operations
Redis owner Engineering
Postgres owner Engineering
object storage owner Engineering
malware scanner owner Security owner
`;

  return {
    'docs/runbooks/incident-response.md': incidentRunbook,
    'docs/runbooks/production-monitoring.md': `
## Alert Routing
Primary owner: Platform owner
Fallback owner: Support lead
Acknowledgement SLA: 15 minutes
Manual verification: run workflow dispatch
`,
    'docs/runbooks/backup-restore.md': 'Latest restore artifact: production-backup-restore.txt',
    '.github/workflows/production-operability.yml': 'backup-restore\nnpm run dr:backup-restore > production-backup-restore.txt',
  };
}
