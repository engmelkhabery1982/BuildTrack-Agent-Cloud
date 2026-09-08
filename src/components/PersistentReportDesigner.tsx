import React, { useState } from 'react';
import { ReportTemplate, ReportVersion, ReportFieldConfig } from '../types';
import { STANDARD_REPORT_FIELDS, validateReportTemplate, createReportSnapshot } from '../utils/reportDesigner';

export interface PersistentReportDesignerProps {
  initialTemplates?: ReportTemplate[];
  onSaveTemplate?: (template: ReportTemplate) => void;
  onIssueSnapshot?: (snapshot: ReportVersion) => void;
}

export const PersistentReportDesigner: React.FC<PersistentReportDesignerProps> = ({
  initialTemplates = [],
  onSaveTemplate,
  onIssueSnapshot,
}) => {
  const [templates, setTemplates] = useState<ReportTemplate[]>(
    initialTemplates.length > 0 ? initialTemplates : [
      {
        id: 'tmpl-001',
        project_id: null,
        template_code: 'REP-EXEC-01',
        template_name: 'Executive Monthly Project Performance',
        report_type: 'Report Pack',
        scope: 'Project',
        revision_number: 1,
        status: 'Approved',
        title: 'Executive Monthly Project Performance',
        subtitle: 'Monthly Portfolio Review & Health Summary',
        logo_attachment_id: null,
        sections: [
          {
            id: 'sec-1',
            title: 'Project Overview & Health',
            type: 'Summary',
            fields: [
              { field_id: 'project_name', label: 'Project Name' },
              { field_id: 'data_date', label: 'Data Date' },
              { field_id: 'overall_health_score', label: 'Overall Health Score' },
              { field_id: 'schedule_spi', label: 'Schedule SPI' },
              { field_id: 'cost_cpi', label: 'Cost CPI' }
            ]
          },
          {
            id: 'sec-2',
            title: 'Cost & Commercial Summary',
            type: 'Table',
            fields: [
              { field_id: 'bac_total', label: 'BAC Total' },
              { field_id: 'fac_total', label: 'FAC Total' },
              { field_id: 'net_cash_flow', label: 'Net Cash Flow' },
              { field_id: 'open_claims_count', label: 'Open Claims' }
            ]
          }
        ],
        footer_text: 'Confidential - PMO Governed Report',
        accent_color: '#0284c7',
        page_size: 'A4',
        orientation: 'portrait',
        show_generated_at: true,
        show_signatures: true,
        locale: 'en-US',
        currency: 'USD',
        date_format: 'YYYY-MM-DD',
        owner: 'PMO Director',
        created_at: new Date().toISOString()
      }
    ]
  );

  const [activeTemplate, setActiveTemplate] = useState<ReportTemplate>(templates[0]);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [issuedSnapshots, setIssuedSnapshots] = useState<ReportVersion[]>([]);

  const handleFieldToggle = (fieldKey: string, fieldLabel: string) => {
    if (!isEditing) return;
    const currentSections = [...activeTemplate.sections];
    const targetSection = currentSections[0];
    if (!targetSection) return;

    const exists = targetSection.fields.some(f => f.field_id === fieldKey);
    if (exists) {
      targetSection.fields = targetSection.fields.filter(f => f.field_id !== fieldKey);
    } else {
      targetSection.fields = [...targetSection.fields, { field_id: fieldKey, label: fieldLabel }];
    }
    setActiveTemplate({ ...activeTemplate, sections: currentSections });
  };

  const handleSave = () => {
    const validation = validateReportTemplate(activeTemplate);
    if (!validation.valid) {
      setErrorMsg(validation.errors.join(', '));
      setSuccessMsg(null);
      return;
    }
    setErrorMsg(null);
    const updated: ReportTemplate = {
      ...activeTemplate,
      revision_number: activeTemplate.revision_number + 1,
      updated_at: new Date().toISOString()
    };
    setActiveTemplate(updated);
    setTemplates(templates.map(t => t.id === updated.id ? updated : t));
    if (onSaveTemplate) onSaveTemplate(updated);
    setSuccessMsg('Template saved successfully with incremented revision number.');
    setIsEditing(false);
  };

  const handleIssueE3 = () => {
    const snapshot = createReportSnapshot(activeTemplate, {
      project_name: 'Alpha Mega Infrastructure',
      data_date: '2026-09-08',
      overall_health_score: 84.5,
      schedule_spi: 0.98,
      cost_cpi: 1.02,
      bac_total: 125000000,
      fac_total: 122400000,
      net_cash_flow: 4500000,
      open_claims_count: 3
    });
    setIssuedSnapshots([snapshot, ...issuedSnapshots]);
    if (onIssueSnapshot) onIssueSnapshot(snapshot);
    setSuccessMsg(`Issued E3 immutable snapshot successfully (${snapshot.id}). Checksum: ${snapshot.snapshot_hash}`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">F8 — Persistent Report Designer</h2>
          <p className="text-sm text-neutral-500 mt-1">Design, version, save, and issue hash-signed E3 report snapshots.</p>
        </div>
        <div className="flex items-center gap-3">
          {!isEditing ? (
            <button 
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 shadow-sm"
            >
              Edit Template
            </button>
          ) : (
            <button 
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 shadow-sm"
            >
              Save Changes
            </button>
          )}
          <button 
            onClick={handleIssueE3}
            className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-sm font-semibold hover:bg-neutral-800 shadow-sm"
          >
            Issue E3 Snapshot
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-medium">
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Template List & Settings */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 space-y-4">
          <h3 className="text-base font-semibold text-neutral-900">Templates</h3>
          <div className="space-y-2">
            {templates.map(t => (
              <div 
                key={t.id}
                onClick={() => { setActiveTemplate(t); setIsEditing(false); }}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${activeTemplate.id === t.id ? 'border-primary-500 bg-primary-50/50' : 'border-neutral-200 hover:border-neutral-300'}`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm text-neutral-900">{t.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 font-medium text-neutral-700">Rev {t.revision_number}</span>
                </div>
                <div className="text-xs text-neutral-500 mt-1">Status: {t.status} | Scope: {t.scope}</div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-neutral-100">
            <h4 className="text-sm font-semibold text-neutral-900 mb-2">Template Properties</h4>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-neutral-500">Title</label>
                <input 
                  type="text" 
                  disabled={!isEditing}
                  value={activeTemplate.title} 
                  onChange={e => setActiveTemplate({...activeTemplate, title: e.target.value})}
                  className="w-full mt-1 px-3 py-2 border rounded-xl bg-neutral-50 disabled:bg-neutral-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-neutral-500">Page Size</label>
                  <select 
                    disabled={!isEditing}
                    value={activeTemplate.page_size}
                    onChange={e => setActiveTemplate({...activeTemplate, page_size: e.target.value as any})}
                    className="w-full mt-1 px-3 py-2 border rounded-xl bg-neutral-50 disabled:bg-neutral-100"
                  >
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-neutral-500">Orientation</label>
                  <select 
                    disabled={!isEditing}
                    value={activeTemplate.orientation}
                    onChange={e => setActiveTemplate({...activeTemplate, orientation: e.target.value as any})}
                    className="w-full mt-1 px-3 py-2 border rounded-xl bg-neutral-50 disabled:bg-neutral-100"
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center/Right Column: Field Registry & Report Preview */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
            <h3 className="text-base font-semibold text-neutral-900 mb-4">Standard Field Registry Allowlist</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {STANDARD_REPORT_FIELDS.map(f => {
                const isSelected = activeTemplate.sections[0]?.fields.some(fc => fc.field_id === f.field_key);
                return (
                  <button
                    key={f.field_key}
                    disabled={!isEditing}
                    onClick={() => handleFieldToggle(f.field_key, f.label)}
                    className={`p-3 rounded-xl border text-left text-xs transition-all ${isSelected ? 'border-primary-600 bg-primary-50 text-primary-900 font-medium' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'} disabled:cursor-not-allowed`}
                  >
                    <div className="font-semibold">{f.label}</div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">{f.category} {f.is_calculated && '(Calc)'}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-neutral-900">Live Report Preview ({activeTemplate.page_size} {activeTemplate.orientation})</h3>
              <span className="text-xs text-neutral-500">Revision {activeTemplate.revision_number}</span>
            </div>
            <div className="border border-dashed border-neutral-300 rounded-xl p-6 bg-neutral-50 space-y-4">
              <div className="text-center border-b border-neutral-200 pb-4">
                <h4 className="font-bold text-lg text-neutral-900">{activeTemplate.title}</h4>
                <p className="text-xs text-neutral-500 mt-1">Scope: {activeTemplate.scope} | Generated at Data Date: 2026-09-08</p>
              </div>
              <div className="space-y-4">
                {activeTemplate.sections.map((sec, idx) => (
                  <div key={sec.id || idx} className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
                    <h5 className="font-semibold text-sm text-neutral-900 mb-2">{sec.title}</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      {sec.fields.map(fc => (
                        <div key={fc.field_id} className="p-2 rounded-lg bg-neutral-50 border border-neutral-100">
                          <span className="text-neutral-500 block">{fc.label}</span>
                          <span className="font-semibold text-neutral-900 mt-0.5 block">
                            {fc.field_id === 'overall_health_score' ? '84.5 / 100' : fc.field_id === 'schedule_spi' ? '0.98' : fc.field_id === 'cost_cpi' ? '1.02' : fc.field_id === 'bac_total' ? '$125,000,000' : 'Sample Value'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {issuedSnapshots.length > 0 && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
              <h3 className="text-base font-semibold text-neutral-900 mb-3">Issued E3 Snapshots ({issuedSnapshots.length})</h3>
              <div className="space-y-2">
                {issuedSnapshots.map(snap => (
                  <div key={snap.id} className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs flex justify-between items-center">
                    <div>
                      <span className="font-bold text-neutral-900">{snap.id}</span> (Rev {snap.version_code})
                      <div className="text-[10px] text-neutral-500 mt-0.5">Checksum: {snap.snapshot_hash}</div>
                    </div>
                    <span className="text-green-700 font-semibold bg-green-50 px-2.5 py-1 rounded-full border border-green-200">Hash-Signed E3</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PersistentReportDesigner;
