import test from 'node:test';
import assert from 'node:assert';
import { validateReportTemplate, createReportSnapshot, STANDARD_REPORT_FIELDS } from '../src/utils/reportDesigner.ts';

test('F8 Persistent Report Designer - validates template and enforces allowlist', () => {
  const validTemplate = {
    title: 'Monthly Executive Report',
    scope: 'Project',
    sections: [
      { id: '1', title: 'Summary', type: 'Summary', fields: [{ field_id: 'project_name', label: 'Name' }] }
    ]
  };

  const res = validateReportTemplate(validTemplate);
  assert.strictEqual(res.valid, true);

  const invalidTemplate = {
    title: '',
    scope: 'Project',
    sections: [
      { id: '1', title: 'Summary', type: 'Summary', fields: [{ field_id: 'unauthorized_hack_field', label: 'Hack' }] }
    ]
  };

  const resInvalid = validateReportTemplate(invalidTemplate);
  assert.strictEqual(resInvalid.valid, false);
  assert.ok(resInvalid.errors.some(e => e.includes('title')));
  assert.ok(resInvalid.errors.some(e => e.includes('unauthorized_hack_field')));
});

test('F8 Persistent Report Designer - creates hash-signed E3 snapshot', () => {
  const template = {
    id: 'tmpl-100',
    project_id: null,
    template_code: 'TEST',
    template_name: 'Test Report',
    report_type: 'Report Pack',
    scope: 'Project',
    revision_number: 2,
    status: 'Approved',
    title: 'Test Report',
    subtitle: '',
    logo_attachment_id: null,
    sections: [{ id: 's1', title: 'Sec', type: 'Summary', fields: [{ field_id: 'project_name', label: 'Name' }] }],
    footer_text: '',
    accent_color: '#000',
    page_size: 'A4',
    orientation: 'portrait',
    show_generated_at: true,
    show_signatures: true,
    locale: 'en',
    currency: 'USD',
    date_format: 'YYYY-MM-DD',
    owner: 'Admin',
    created_at: new Date().toISOString()
  };

  const snapshot = createReportSnapshot(template, { project_name: 'Test Project' });
  assert.ok(snapshot.id.startsWith('snap-'));
  assert.strictEqual(snapshot.template_id, 'tmpl-100');
  assert.ok(snapshot.snapshot_hash.length > 10);
  assert.strictEqual(JSON.parse(snapshot.snapshot_payload).project_name, 'Test Project');
});
