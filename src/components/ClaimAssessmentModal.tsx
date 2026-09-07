import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ArrowRight, ShieldAlert, CheckCircle, FileText } from 'lucide-react';
import { Claim, ClaimLine } from '@/types';
import { calculateClaimTotals, validateClaim, convertClaimToVariationPayload } from '@/data/claims';

interface ClaimAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  claim: Claim | null;
  projects: any[];
  contracts: any[];
  rfiList?: any[];
  delayEvents?: any[];
  documents?: any[];
  boqHeaders?: any[];
  boqItems?: any[];
  onSave: (claim: Claim, lines: ClaimLine[]) => Promise<void>;
  onConvertToVariation?: (variation: any, variationLines: any[], updatedClaim: Claim) => Promise<void>;
}

export const ClaimAssessmentModal: React.FC<ClaimAssessmentModalProps> = ({
  isOpen,
  onClose,
  claim,
  projects,
  contracts,
  rfiList = [],
  delayEvents = [],
  documents = [],
  boqHeaders = [],
  boqItems = [],
  onSave,
  onConvertToVariation,
}) => {
  const [formData, setFormData] = useState<Partial<Claim>>({
    claim_number: `CLAIM-${Math.floor(1000 + Math.random() * 9000)}`,
    title: '',
    project_id: projects[0]?.id || '',
    contract_id: contracts[0]?.id || '',
    notice_date: new Date().toISOString().slice(0, 10),
    event_date: new Date().toISOString().slice(0, 10),
    entitlement_basis: 'Clause 20.1 - Employer Risk Event / Variation',
    status: 'Draft',
    owner: 'Commercial Manager',
    claimed_cost_impact: 0,
    claimed_time_impact_days: 0,
    assessed_cost_impact: 0,
    assessed_time_impact_days: 0,
    approved_cost_impact: 0,
    approved_time_impact_days: 0,
    evidence_notes: '',
  });

  const [lines, setLines] = useState<ClaimLine[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (claim) {
      setFormData(claim);
      // If we had lines loaded in props or state, parse them here. For now start empty or from claim
      setLines((claim as any).lines || []);
    } else {
      setFormData({
        id: crypto.randomUUID(),
        claim_number: `CLAIM-${Math.floor(1000 + Math.random() * 9000)}`,
        title: '',
        project_id: projects[0]?.id || '',
        contract_id: contracts[0]?.id || '',
        notice_date: new Date().toISOString().slice(0, 10),
        event_date: new Date().toISOString().slice(0, 10),
        entitlement_basis: 'Clause 20.1 - Employer Risk Event',
        status: 'Draft',
        owner: 'Commercial Manager',
        claimed_cost_impact: 0,
        claimed_time_impact_days: 0,
        assessed_cost_impact: 0,
        assessed_time_impact_days: 0,
        approved_cost_impact: 0,
        approved_time_impact_days: 0,
        created_at: new Date().toISOString().slice(0, 10),
      });
      setLines([
        {
          id: crypto.randomUUID(),
          claim_id: '',
          contract_id: contracts[0]?.id || '',
          item_code: 'BOQ-001',
          description: 'Claim item description',
          change_type: 'New Item',
          claimed_value: 10000,
          assessed_value: 8000,
          approved_value: 0,
          boq_header_id: boqHeaders[0]?.id || null,
          boq_item_id: boqItems[0]?.id || null,
        }
      ]);
    }
    setErrors([]);
  }, [claim, isOpen, projects, contracts, boqHeaders, boqItems]);

  if (!isOpen) return null;

  const totals = calculateClaimTotals(lines);

  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        id: crypto.randomUUID(),
        claim_id: formData.id || '',
        contract_id: formData.contract_id || '',
        item_code: `ITEM-${lines.length + 1}`,
        description: '',
        change_type: 'Quantity Change',
        claimed_value: 0,
        assessed_value: 0,
        approved_value: 0,
        boq_header_id: boqHeaders[0]?.id || null,
        boq_item_id: boqItems[0]?.id || null,
      }
    ]);
  };

  const handleRemoveLine = (id: string) => {
    setLines(lines.filter((l) => l.id !== id));
  };

  const handleLineChange = (id: string, field: keyof ClaimLine, val: any) => {
    setLines(lines.map((l) => (l.id === id ? { ...l, [field]: val } : l)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateClaim(formData, lines, contracts);
    if (validationErrors.length > 0 && validationErrors.some((e) => !e.startsWith('Warning'))) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const finalClaim: Claim = {
        ...(formData as Claim),
        claimed_cost_impact: totals.claimedTotal,
        assessed_cost_impact: totals.assessedTotal,
        approved_cost_impact: totals.approvedTotal,
        created_at: formData.created_at || new Date().toISOString().slice(0, 10),
      };
      await onSave(finalClaim, lines);
      onClose();
    } catch (err: any) {
      setErrors([err.message || 'Failed to save claim']);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConvert = async () => {
    if (formData.status !== 'Approved') {
      setErrors(['Only an Approved Claim / PVO can be converted into a Variation package.']);
      return;
    }
    try {
      const fullClaim = { ...(formData as Claim), claimed_cost_impact: totals.claimedTotal, assessed_cost_impact: totals.assessedTotal, approved_cost_impact: totals.approvedTotal };
      const { variation, variationLines } = convertClaimToVariationPayload(fullClaim, lines);
      const updatedClaim: Claim = {
        ...fullClaim,
        status: 'Converted',
        converted_variation_id: variation.id,
      };
      if (onConvertToVariation) {
        await onConvertToVariation(variation, variationLines, updatedClaim);
      }
      onClose();
    } catch (err: any) {
      setErrors([err.message || 'Failed to convert claim to variation']);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-600" />
              Claim & Potential Variation Order (PVO) Assessment
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manage notice dates, entitlement basis, cost/time impact assessments, and governed variation conversion.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errors.length > 0 && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <ShieldAlert className="w-4 h-4" /> Validation & Governance Warnings:
              </div>
              <ul className="list-disc pl-5">
                {errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Claim / PVO Number
              </label>
              <input
                type="text"
                value={formData.claim_number || ''}
                onChange={(e) => setFormData({ ...formData, claim_number: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Title / Subject
              </label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="e.g. Unforeseen Ground Conditions at Foundation Level"
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Project
              </label>
              <select
                value={formData.project_id || ''}
                onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.project_name || p.project_code || p.id}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Contract
              </label>
              <select
                value={formData.contract_id || ''}
                onChange={(e) => setFormData({ ...formData, contract_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                {contracts.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.contract_title || c.contract_number || c.id}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Status
              </label>
              <select
                value={formData.status || 'Draft'}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
              >
                {['Draft', 'Notified', 'Submitted', 'Under Assessment', 'Assessed', 'Approved', 'Rejected', 'Converted'].map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Event Occurrence Date
              </label>
              <input
                type="date"
                value={formData.event_date || ''}
                onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Notice Given Date
              </label>
              <input
                type="date"
                value={formData.notice_date || ''}
                onChange={(e) => setFormData({ ...formData, notice_date: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Owner / Assessor
              </label>
              <input
                type="text"
                value={formData.owner || ''}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Entitlement Basis & Contract Clause
              </label>
              <input
                type="text"
                value={formData.entitlement_basis || ''}
                onChange={(e) => setFormData({ ...formData, entitlement_basis: e.target.value })}
                placeholder="e.g. FIDIC Sub-Clause 20.1 / Sub-Clause 8.4 Extension of Time"
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Impact Comparison Summary Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Claimed Impact</span>
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                ${totals.claimedTotal.toLocaleString()}
              </div>
              <div className="text-xs text-slate-500">
                Time: {formData.claimed_time_impact_days || 0} days
              </div>
              <input
                type="number"
                placeholder="Claimed Time (Days)"
                value={formData.claimed_time_impact_days || 0}
                onChange={(e) => setFormData({ ...formData, claimed_time_impact_days: Number(e.target.value) })}
                className="w-full mt-2 px-2 py-1 text-xs border rounded bg-white dark:bg-slate-800"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-amber-600 uppercase">Assessed Impact</span>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-400">
                ${totals.assessedTotal.toLocaleString()}
              </div>
              <div className="text-xs text-slate-500">
                Time: {formData.assessed_time_impact_days || 0} days
              </div>
              <input
                type="number"
                placeholder="Assessed Time (Days)"
                value={formData.assessed_time_impact_days || 0}
                onChange={(e) => setFormData({ ...formData, assessed_time_impact_days: Number(e.target.value) })}
                className="w-full mt-2 px-2 py-1 text-xs border rounded bg-white dark:bg-slate-800"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-emerald-600 uppercase">Approved Impact</span>
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                ${totals.approvedTotal.toLocaleString()}
              </div>
              <div className="text-xs text-slate-500">
                Time: {formData.approved_time_impact_days || 0} days
              </div>
              <input
                type="number"
                placeholder="Approved Time (Days)"
                value={formData.approved_time_impact_days || 0}
                onChange={(e) => setFormData({ ...formData, approved_time_impact_days: Number(e.target.value) })}
                className="w-full mt-2 px-2 py-1 text-xs border rounded bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          {/* Claim Lines Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-md font-semibold text-slate-900 dark:text-white">Claim Cost Breakdown Lines</h3>
              <button
                type="button"
                onClick={handleAddLine}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Line
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <th className="p-2.5">Item Code</th>
                    <th className="p-2.5">Description</th>
                    <th className="p-2.5">Change Type</th>
                    <th className="p-2.5 text-right">Claimed ($)</th>
                    <th className="p-2.5 text-right">Assessed ($)</th>
                    <th className="p-2.5 text-right">Approved ($)</th>
                    <th className="p-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {lines.map((line) => (
                    <tr key={line.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="p-2">
                        <input
                          type="text"
                          value={line.item_code}
                          onChange={(e) => handleLineChange(line.id, 'item_code', e.target.value)}
                          className="w-24 px-2 py-1 border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => handleLineChange(line.id, 'description', e.target.value)}
                          placeholder="Description"
                          className="w-full min-w-[180px] px-2 py-1 border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={line.change_type}
                          onChange={(e) => handleLineChange(line.id, 'change_type', e.target.value as any)}
                          className="px-2 py-1 border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        >
                          {['New Item', 'Quantity Change', 'Rate Change', 'Quantity & Rate Change'].map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          value={line.claimed_value}
                          onChange={(e) => handleLineChange(line.id, 'claimed_value', Number(e.target.value))}
                          className="w-24 px-2 py-1 text-right border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          value={line.assessed_value}
                          onChange={(e) => handleLineChange(line.id, 'assessed_value', Number(e.target.value))}
                          className="w-24 px-2 py-1 text-right border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          value={line.approved_value}
                          onChange={(e) => handleLineChange(line.id, 'approved_value', Number(e.target.value))}
                          className="w-24 px-2 py-1 text-right border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Evidence Notes & Reference Links (RFI / Delay / Letters)
            </label>
            <textarea
              rows={3}
              value={formData.evidence_notes || ''}
              onChange={(e) => setFormData({ ...formData, evidence_notes: e.target.value })}
              placeholder="Attach links to RFI records, delay event logs, site photos, or baseline schedule fragments..."
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div>
            {formData.status === 'Approved' && !formData.converted_variation_id && onConvertToVariation && (
              <button
                type="button"
                onClick={handleConvert}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors"
              >
                <CheckCircle className="w-4 h-4" /> Convert to Variation Package
              </button>
            )}
            {formData.status === 'Converted' && (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Converted to Variation (ID: {formData.converted_variation_id})
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors flex items-center gap-2"
            >
              {isSubmitting ? 'Saving...' : 'Save Claim Assessment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
