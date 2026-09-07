import type { ReportVersion } from '@/types';

export interface IssueReportVersionResult {
  id: string;
  status: 'Issued';
  supersededIds: string[];
}

export async function issueReportVersion(version: ReportVersion): Promise<IssueReportVersionResult> {
  if (!("__TAURI_INTERNALS__" in window)) {
    throw new Error('Controlled report issuance is available only in the BuildTrack desktop application.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<IssueReportVersionResult>('issue_report_version', {
    request: {
      id: version.id,
      projectId: version.project_id,
      contractId: version.contract_id,
      dataDate: version.data_date,
      packType: version.pack_type,
      templateId: version.template_id,
      versionCode: version.version_code,
      snapshotHash: version.snapshot_hash,
      snapshotPayload: version.snapshot_payload,
      issuer: version.issuer,
      signOffNote: version.sign_off_note || '',
      issuedAt: version.issued_at || version.created_at,
      createdAt: version.created_at,
    },
  });
}
