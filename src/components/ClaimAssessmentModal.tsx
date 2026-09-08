import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle,
  FileText,
  Clock,
  DollarSign,
  ShieldCheck,
  RotateCcw,
  Send,
  XCircle,
  Link as LinkIcon,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  Claim,
  ClaimLine,
  ClaimStatus,
  ClaimLineChangeType,
  Project,
  Contract,
  BOQHeader,
  BOQItem,
  Variation,
  VariationLine,
} from '@/types';
import {
  calculateClaimTotals,
  evaluateContractNoticePeriod,
  validateClaim,
  canTransitionClaimStatus,
  convertClaimToVariationPayload,
  reverseClaimConversion,
  CLAIM_LINE_CHANGE_TYPES,
  CLAIM_LIFECYCLE_STATUSES,
  money,
} from '@/data/claims';

interface ClaimAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  claim: Claim | null;
  projects: Project[];
  contracts: Contract[];
  boqHeaders: BOQHeader[];
  boqItems: BOQItem[];
  rfis?: any[];
  delays?: any[];
  documents?: any[];
  schedules?: any[];
  currentUser?: string;
  onSave?: (claim: Claim, lines: ClaimLine[]) => Promise<void>;
  onSaveDraft?: (claim: Claim, lines: ClaimLine[]) => Promise<void>;
  onSubmitClaim?: (claim: Claim, lines: ClaimLine[]) => Promise<void>;
  onAssessClaim?: (claim: Claim, lines: ClaimLine[], notes?: string) => Promise<void>;
  onApproveClaim?: (claim: Claim, lines: ClaimLine[], notes?: string) => Promise<void>;
  onRejectClaim?: (claim: Claim, reason: string) => Promise<void>;
  onReopenClaim?: (claim: Claim, targetStatus: 'Draft' | 'Under Assessment', reason: string) => Promise<void>;
  onConvertToVariation?: (variationPayload: Variation, linesPayload: VariationLine[], updatedClaim: Claim) => Promise<void>;
  onReverseConversion?: (claim: Claim, reason: string) => Promise<void>;
}

export const ClaimAssessmentModal: React.FC<ClaimAssessmentModalProps> = ({
  isOpen,
  onClose,
  claim,
  projects = [],
  contracts = [],
  boqHeaders = [],
  boqItems = [],
  rfis = [],
  delays = [],
  documents = [],
  schedules = [],
  currentUser = 'Commercial Manager',
  onSave,
  onSaveDraft,
  onSubmitClaim,
  onAssessClaim,
  onApproveClaim,
  onRejectClaim,
  onReopenClaim,
  onConvertToVariation,
  onReverseConversion,
}) => {
  const [formData, setFormData] = useState<Partial<Claim>>({});
  const [lines, setLines] = useState<ClaimLine[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'lines' | 'evidence' | 'history'>('details');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success' | 'warning'; message: string } | null>(null);

  // Dialog state for Reason prompt (Rejection / Reopening / Reversal)
  const [reasonDialogOpen, setReasonDialogOpen] = useState<false | 'reject' | 'reopen' | 'reverse'>(false);
  const [reasonText, setReasonText] = useState('');
  const [reopenTargetStatus, setReopenTargetStatus] = useState<'Draft' | 'Under Assessment'>('Draft');

  // Initialize or reset form state when claim changes or modal opens
  useEffect(() => {
    if (claim) {
      setFormData({
        ...claim,
        status: claim.status || 'Draft',
        claimed_cost_impact: Number(claim.claimed_cost_impact) || 0,
        claimed_time_impact_days: Number(claim.claimed_time_impact_days) || 0,
        assessed_cost_impact: Number(claim.assessed_cost_impact) || 0,
        assessed_time_impact_days: Number(claim.assessed_time_impact_days) || 0,
        approved_cost_impact: Number(claim.approved_cost_impact) || 0,
        approved_time_impact_days: Number(claim.approved_time_impact_days) || 0,
      });

      // Load lines from claim if passed or embedded in payload
      const initialLines: ClaimLine[] = (claim as any).lines || [];
      if (initialLines.length > 0) {
        setLines(initialLines);
      } else {
        // Fallback default line if brand new
        setLines([
          {
            id: `line-${Date.now()}-1`,
            claim_id: claim.id,
            contract_id: claim.contract_id,
            item_code: 'CLM-01',
            description: claim.title || 'Direct cost & schedule impact',
            change_type: 'New Item',
            claimed_value: Number(claim.claimed_cost_impact) || 0,
            assessed_value: Number(claim.assessed_cost_impact) || 0,
            approved_value: Number(claim.approved_cost_impact) || 0,
            claimed_days: Number(claim.claimed_time_impact_days) || 0,
            assessed_days: Number(claim.assessed_time_impact_days) || 0,
            approved_days: Number(claim.approved_time_impact_days) || 0,
          },
        ]);
      }
    } else {
      const defaultProjectId = projects[0]?.id || '';
      const matchingContracts = contracts.filter((c) => !defaultProjectId || c.project_id === defaultProjectId);
      const defaultContractId = matchingContracts[0]?.id || '';
      const now = new Date().toISOString().slice(0, 10);

      setFormData({
        id: `clm-${Date.now()}`,
        project_id: defaultProjectId,
        contract_id: defaultContractId,
        claim_number: `CLM-${String(Math.floor(Math.random() * 900) + 100)}`,
        title: '',
        notice_date: now,
        event_date: now,
        entitlement_basis: 'Unforeseen physical conditions / Employer instruction',
        status: 'Draft',
        owner: currentUser,
        claimed_cost_impact: 0,
        claimed_time_impact_days: 0,
        assessed_cost_impact: 0,
        assessed_time_impact_days: 0,
        approved_cost_impact: 0,
        approved_time_impact_days: 0,
        created_at: now,
      });

      setLines([
        {
          id: `line-${Date.now()}-1`,
          claim_id: `clm-${Date.now()}`,
          contract_id: defaultContractId,
          item_code: 'ITEM-01',
          description: 'Primary cost & time impact breakdown',
          change_type: 'New Item',
          claimed_value: 0,
          assessed_value: 0,
          approved_value: 0,
          claimed_days: 0,
          assessed_days: 0,
          approved_days: 0,
        },
      ]);
    }
    setFeedback(null);
    setReasonDialogOpen(false);
    setReasonText('');
  }, [claim, isOpen, projects, contracts, currentUser]);

  // Derived filtered contracts based on selected project
  const filteredContracts = useMemo(() => {
    if (!formData.project_id) return contracts;
    return contracts.filter((c) => c.project_id === formData.project_id);
  }, [contracts, formData.project_id]);

  // Derived filtered BOQ headers and items based on selected contract
  const filteredBoqHeaders = useMemo(() => {
    if (!formData.contract_id) return boqHeaders;
    return boqHeaders.filter((h) => h.contract_id === formData.contract_id || !h.contract_id);
  }, [boqHeaders, formData.contract_id]);

  const filteredBoqItems = useMemo(() => {
    if (!formData.project_id) return boqItems;
    return boqItems.filter((i) => i.project_id === formData.project_id);
  }, [boqItems, formData.project_id]);

  // Derived filtered RFIs, Delays, Schedules
  const filteredRfis = useMemo(() => {
    return rfis.filter((r) => (!formData.project_id || r.project_id === formData.project_id));
  }, [rfis, formData.project_id]);

  const filteredDelays = useMemo(() => {
    return delays.filter((d) => (!formData.project_id || d.project_id === formData.project_id));
  }, [delays, formData.project_id]);

  const filteredActivities = useMemo(() => {
    return schedules.filter((s) => (!formData.contract_id || s.contract_id === formData.contract_id));
  }, [schedules, formData.contract_id]);

  // Notice evaluation
  const selectedContract = useMemo(() => {
    return contracts.find((c) => c.id === formData.contract_id);
  }, [contracts, formData.contract_id]);

  const noticeEvaluation = useMemo(() => {
    return evaluateContractNoticePeriod(formData.event_date, formData.notice_date, selectedContract);
  }, [formData.event_date, formData.notice_date, selectedContract]);

  // Line totals
  const totals = useMemo(() => {
    return calculateClaimTotals(lines, formData);
  }, [lines, formData]);

  // Sync totals to header when lines change
  const handleLineChange = (id: string, field: keyof ClaimLine, value: any) => {
    setLines((prev) => {
      const updated = prev.map((l) => (l.id === id ? { ...l, [field]: value } : l));
      return updated;
    });
  };

  const handleAddLine = () => {
    const newLine: ClaimLine = {
      id: `line-${Date.now()}-${lines.length + 1}`,
      claim_id: formData.id || '',
      contract_id: formData.contract_id || '',
      item_code: `ITEM-0${lines.length + 1}`,
      description: '',
      change_type: 'New Item',
      claimed_value: 0,
      assessed_value: 0,
      approved_value: 0,
      claimed_days: 0,
      assessed_days: 0,
      approved_days: 0,
      boq_header_id: filteredBoqHeaders[0]?.id || null,
      boq_item_id: null,
    };
    setLines([...lines, newLine]);
  };

  const handleRemoveLine = (id: string) => {
    if (lines.length <= 1) {
      setFeedback({ type: 'warning', message: 'At least one claim breakdown line is required.' });
      return;
    }
    setLines(lines.filter((l) => l.id !== id));
  };

  // Build current claim object with derived totals
  const buildCurrentClaimObject = (overrideStatus?: ClaimStatus): Claim => {
    return {
      ...(formData as Claim),
      id: formData.id || `clm-${Date.now()}`,
      project_id: formData.project_id || '',
      contract_id: formData.contract_id || '',
      claim_number: formData.claim_number || '',
      title: formData.title || '',
      notice_date: formData.notice_date || '',
      event_date: formData.event_date || '',
      entitlement_basis: formData.entitlement_basis || '',
      status: overrideStatus || (formData.status as ClaimStatus) || 'Draft',
      owner: formData.owner || currentUser,
      claimed_cost_impact: totals.claimedTotal,
      claimed_time_impact_days: totals.claimedDaysTotal,
      assessed_cost_impact: totals.assessedTotal,
      assessed_time_impact_days: totals.assessedDaysTotal,
      approved_cost_impact: totals.approvedTotal,
      approved_time_impact_days: totals.approvedDaysTotal,
      created_at: formData.created_at || new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString().slice(0, 10),
    };
  };

  // Governance validation check
  const runValidation = (targetStatus?: ClaimStatus) => {
    const claimToTest = buildCurrentClaimObject(targetStatus);
    const result = validateClaim(claimToTest, lines, {
      projects,
      contracts,
      boqHeaders,
      boqItems,
      rfis,
      delays,
      documents,
    });
    return result;
  };

  // 1. Save Draft
  const handleSaveDraft = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const claimObj = buildCurrentClaimObject();
      const val = runValidation();
      if (!val.valid) {
        setFeedback({ type: 'error', message: val.errors.join(' | ') });
        setIsSubmitting(false);
        return;
      }
      if (onSaveDraft) {
        await onSaveDraft(claimObj, lines);
      } else if (onSave) {
        await onSave(claimObj, lines);
      }
      setFeedback({ type: 'success', message: 'Claim draft saved successfully.' });
      onClose();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save draft.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Submit Claim
  const handleSubmitClaim = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const transCheck = canTransitionClaimStatus(formData.status as ClaimStatus || 'Draft', 'Submitted', currentUser, formData.owner);
      if (!transCheck.allowed) {
        setFeedback({ type: 'error', message: transCheck.reason || 'Transition not allowed.' });
        setIsSubmitting(false);
        return;
      }

      const claimObj = buildCurrentClaimObject('Submitted');
      claimObj.submitted_by = currentUser;
      claimObj.submitted_at = new Date().toISOString().slice(0, 10);

      const val = runValidation('Submitted');
      if (!val.valid) {
        setFeedback({ type: 'error', message: val.errors.join(' | ') });
        setIsSubmitting(false);
        return;
      }

      if (onSubmitClaim) {
        await onSubmitClaim(claimObj, lines);
      } else if (onSave) {
        await onSave(claimObj, lines);
      }
      setFeedback({ type: 'success', message: 'Claim formally submitted for assessment.' });
      onClose();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to submit claim.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Record Assessment
  const handleAssessClaim = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const transCheck = canTransitionClaimStatus(formData.status as ClaimStatus, 'Assessed', currentUser, formData.owner);
      if (!transCheck.allowed) {
        setFeedback({ type: 'error', message: transCheck.reason || 'Maker-checker policy prevents assessment.' });
        setIsSubmitting(false);
        return;
      }

      const claimObj = buildCurrentClaimObject('Assessed');
      claimObj.assessed_by = currentUser;
      claimObj.assessed_at = new Date().toISOString().slice(0, 10);

      const val = runValidation('Assessed');
      if (!val.valid) {
        setFeedback({ type: 'error', message: val.errors.join(' | ') });
        setIsSubmitting(false);
        return;
      }

      if (onAssessClaim) {
        await onAssessClaim(claimObj, lines, formData.evidence_notes || undefined);
      } else if (onSave) {
        await onSave(claimObj, lines);
      }
      setFeedback({ type: 'success', message: 'Claim assessment recorded successfully.' });
      onClose();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to record assessment.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Approve Claim
  const handleApproveClaim = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const transCheck = canTransitionClaimStatus(formData.status as ClaimStatus, 'Approved', currentUser, formData.owner);
      if (!transCheck.allowed) {
        setFeedback({ type: 'error', message: transCheck.reason || 'Maker-checker policy prevents approval.' });
        setIsSubmitting(false);
        return;
      }

      const claimObj = buildCurrentClaimObject('Approved');
      claimObj.approved_by = currentUser;
      claimObj.approved_at = new Date().toISOString().slice(0, 10);

      // Default approved values from assessed if approved value is 0
      const updatedLines = lines.map((l) => ({
        ...l,
        approved_value: Number(l.approved_value) > 0 ? Number(l.approved_value) : (Number(l.assessed_value) > 0 ? Number(l.assessed_value) : Number(l.claimed_value)),
        approved_days: Number(l.approved_days) > 0 ? Number(l.approved_days) : (Number(l.assessed_days) > 0 ? Number(l.assessed_days) : Number(l.claimed_days)),
      }));

      const val = validateClaim(claimObj, updatedLines, { projects, contracts, boqHeaders, boqItems });
      if (!val.valid) {
        setFeedback({ type: 'error', message: val.errors.join(' | ') });
        setIsSubmitting(false);
        return;
      }

      if (onApproveClaim) {
        await onApproveClaim(claimObj, updatedLines, formData.evidence_notes || undefined);
      } else if (onSave) {
        await onSave(claimObj, updatedLines);
      }
      setFeedback({ type: 'success', message: 'Claim approved successfully.' });
      onClose();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to approve claim.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Convert to Variation
  const handleConvertToVariation = async () => {
    if (formData.status !== 'Approved') {
      setFeedback({ type: 'error', message: 'Only an Approved claim can be converted into a Variation package.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const claimObj = buildCurrentClaimObject('Approved');
      const conversion = convertClaimToVariationPayload(claimObj, lines, {
        actor: currentUser,
        convertedAt: new Date().toISOString().slice(0, 10),
      });

      if (onConvertToVariation) {
        await onConvertToVariation(conversion.variation, conversion.variationLines, conversion.updatedClaim);
      } else if (onSave) {
        await onSave(conversion.updatedClaim, lines);
      }
      setFeedback({ type: 'success', message: `Converted to Draft Variation Package: ${conversion.variation.variation_number}` });
      onClose();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to convert claim to variation.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 6. Handle Reason Submission (Reject / Reopen / Reverse)
  const handleReasonActionSubmit = async () => {
    if (!reasonText.trim()) {
      setFeedback({ type: 'error', message: 'A justification/reason is required.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const claimObj = buildCurrentClaimObject();

      if (reasonDialogOpen === 'reject') {
        claimObj.status = 'Rejected';
        claimObj.rejected_by = currentUser;
        claimObj.rejected_at = new Date().toISOString().slice(0, 10);
        claimObj.rejection_reason = reasonText.trim();

        if (onRejectClaim) {
          await onRejectClaim(claimObj, reasonText.trim());
        } else if (onSave) {
          await onSave(claimObj, lines);
        }
        setFeedback({ type: 'success', message: 'Claim rejected.' });
      } else if (reasonDialogOpen === 'reopen') {
        claimObj.status = reopenTargetStatus;
        claimObj.reopened_by = currentUser;
        claimObj.reopened_at = new Date().toISOString().slice(0, 10);
        claimObj.reopened_reason = reasonText.trim();

        if (onReopenClaim) {
          await onReopenClaim(claimObj, reopenTargetStatus, reasonText.trim());
        } else if (onSave) {
          await onSave(claimObj, lines);
        }
        setFeedback({ type: 'success', message: `Claim reopened to ${reopenTargetStatus}.` });
      } else if (reasonDialogOpen === 'reverse') {
        const rev = reverseClaimConversion(claimObj, null, reasonText.trim(), currentUser);
        if (rev.reasonError) {
          throw new Error(rev.reasonError);
        }
        if (onReverseConversion) {
          await onReverseConversion(rev.updatedClaim, reasonText.trim());
        } else if (onSave) {
          await onSave(rev.updatedClaim, lines);
        }
        setFeedback({ type: 'success', message: 'Claim conversion reversed. Reverted to Approved status.' });
      }

      setReasonDialogOpen(false);
      onClose();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Operation failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentStatus = (formData.status as ClaimStatus) || 'Draft';
  const isReadOnly = currentStatus === 'Approved' || currentStatus === 'Converted' || currentStatus === 'Rejected';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {claim ? `Claim & PVO: ${formData.claim_number}` : 'New Claim / Potential Variation Order'}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                    currentStatus === 'Approved'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : currentStatus === 'Converted'
                      ? 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                      : currentStatus === 'Assessed'
                      ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                      : currentStatus === 'Under Assessment'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                      : currentStatus === 'Submitted'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : currentStatus === 'Rejected'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                      : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {currentStatus}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Governed Claim Assessment, Time-Bar Control & PVO Conversion Workbench
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback / Alert Banners */}
        {feedback && (
          <div
            className={`px-6 py-2.5 text-xs font-medium flex items-center gap-2 ${
              feedback.type === 'error'
                ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-b border-rose-200 dark:border-rose-900'
                : feedback.type === 'warning'
                ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-b border-amber-200 dark:border-amber-900'
                : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-b border-emerald-200 dark:border-emerald-900'
            }`}
          >
            {feedback.type === 'error' ? <XCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Late Notice Banner */}
        {noticeEvaluation.isLate && (
          <div className="px-6 py-2 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-b border-amber-200 dark:border-amber-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                <strong>Contractual Time-Bar Warning:</strong> Notice served {noticeEvaluation.diffDays} days after event (Contract window: {noticeEvaluation.noticeDaysAllowed || 28} days, deadline: {noticeEvaluation.noticeDeadline}).
              </span>
            </div>
            <span className="px-2 py-0.5 bg-amber-200 dark:bg-amber-900/60 rounded text-[10px] font-bold uppercase">
              Late Notice Flagged
            </span>
          </div>
        )}

        {/* Rejection / Reversal Alert */}
        {formData.status === 'Rejected' && formData.rejection_reason && (
          <div className="px-6 py-2 bg-rose-500/10 text-rose-700 dark:text-rose-400 border-b border-rose-200 dark:border-rose-900 text-xs flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>
              <strong>Rejection Reason ({formData.rejected_by || 'Approver'}):</strong> {formData.rejection_reason}
            </span>
          </div>
        )}

        {formData.reversal_reason && (
          <div className="px-6 py-2 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-b border-blue-200 dark:border-blue-900 text-xs flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span>
              <strong>Reversal Log:</strong> {formData.reversal_reason}
            </span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900 px-6">
          {[
            { id: 'details', label: 'Claim Scope & Entitlement' },
            { id: 'lines', label: `Cost Breakdown Lines (${lines.length})` },
            { id: 'evidence', label: 'Evidence & Links' },
            { id: 'history', label: 'Governance Trail' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Claimed Impact
                </span>
                <DollarSign className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white">
                ${totals.claimedTotal.toLocaleString()}
              </div>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Time: {totals.claimedDaysTotal} Days
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Assessed Impact
                </span>
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-xl font-extrabold text-indigo-700 dark:text-indigo-400">
                ${totals.assessedTotal.toLocaleString()}
              </div>
              <div className="text-xs text-indigo-600 dark:text-indigo-300 mt-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Time: {totals.assessedDaysTotal} Days
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  Approved Impact
                </span>
                <CheckCircle className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
                ${totals.approvedTotal.toLocaleString()}
              </div>
              <div className="text-xs text-emerald-600 dark:text-emerald-300 mt-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Time: {totals.approvedDaysTotal} Days
              </div>
            </div>
          </div>

          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Project *
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={formData.project_id || ''}
                    onChange={(e) => {
                      const pId = e.target.value;
                      const matched = contracts.filter((c) => c.project_id === pId);
                      setFormData({
                        ...formData,
                        project_id: pId,
                        contract_id: matched[0]?.id || '',
                      });
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="">Select Project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.project_code || p.id} - {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Contract Code *
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={formData.contract_id || ''}
                    onChange={(e) => setFormData({ ...formData, contract_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="">Select Contract</option>
                    {filteredContracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contract_number} ({c.contract_type || 'Main'}) - {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Claim / PVO Number *
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={formData.claim_number || ''}
                    onChange={(e) => setFormData({ ...formData, claim_number: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Claim Title *
                </label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  placeholder="e.g. Unforeseen rock excavation & utility diversion at Sector B"
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Event Occurrence Date *
                  </label>
                  <input
                    type="date"
                    disabled={isReadOnly}
                    value={formData.event_date || ''}
                    onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Formal Notice Date *
                  </label>
                  <input
                    type="date"
                    disabled={isReadOnly}
                    value={formData.notice_date || ''}
                    onChange={(e) => setFormData({ ...formData, notice_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Claimant Party
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    placeholder="e.g. Subcontractor / JV"
                    value={formData.claimant_party_id || ''}
                    onChange={(e) => setFormData({ ...formData, claimant_party_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Claim Creator / Owner
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={formData.owner || ''}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Contractual Entitlement Basis & Clause Reference *
                </label>
                <textarea
                  rows={2}
                  disabled={isReadOnly}
                  placeholder="e.g. FIDIC Red Book Clause 4.12 (Unforeseeable Physical Conditions) and Clause 8.4 (Extension of Time for Completion)"
                  value={formData.entitlement_basis || ''}
                  onChange={(e) => setFormData({ ...formData, entitlement_basis: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              {/* Scoped Linked Items */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Linked RFI Reference
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={formData.linked_rfi_id || ''}
                    onChange={(e) => setFormData({ ...formData, linked_rfi_id: e.target.value || null })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="">None / Direct Notice</option>
                    {filteredRfis.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.rfi_number || r.id} - {r.subject || r.title || 'RFI'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Linked Delay Event
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={formData.linked_delay_id || ''}
                    onChange={(e) => setFormData({ ...formData, linked_delay_id: e.target.value || null })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="">None / Cost Only Claim</option>
                    {filteredDelays.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.event_code || d.id} - {d.title || 'Delay Event'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Linked Schedule Activity
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={formData.linked_activity_id || ''}
                    onChange={(e) => setFormData({ ...formData, linked_activity_id: e.target.value || null })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="">None / Project Wide</option>
                    {filteredActivities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.activity_code || a.id} - {a.activity_name || a.name || 'Activity'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LINES */}
          {activeTab === 'lines' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Cost & Schedule Breakdown Lines
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Granular items forming the claim valuation and time extension demand.
                  </p>
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Breakdown Line
                  </button>
                )}
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold">
                      <th className="p-2.5 min-w-[100px]">Item Code</th>
                      <th className="p-2.5 min-w-[160px]">Description</th>
                      <th className="p-2.5 min-w-[130px]">Change Type</th>
                      <th className="p-2.5 min-w-[130px]">Linked BOQ</th>
                      <th className="p-2.5 text-right min-w-[90px]">Claimed ($)</th>
                      <th className="p-2.5 text-right min-w-[80px]">Claimed (Days)</th>
                      <th className="p-2.5 text-right min-w-[90px]">Assessed ($)</th>
                      <th className="p-2.5 text-right min-w-[80px]">Assessed (Days)</th>
                      <th className="p-2.5 text-right min-w-[90px]">Approved ($)</th>
                      {!isReadOnly && <th className="p-2.5 text-center w-12">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {lines.map((line) => (
                      <tr key={line.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={line.item_code}
                            onChange={(e) => handleLineChange(line.id, 'item_code', e.target.value)}
                            className="w-full px-2 py-1 border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            placeholder="Description"
                            value={line.description}
                            onChange={(e) => handleLineChange(line.id, 'description', e.target.value)}
                            className="w-full px-2 py-1 border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            disabled={isReadOnly}
                            value={line.change_type}
                            onChange={(e) => handleLineChange(line.id, 'change_type', e.target.value as any)}
                            className="w-full px-2 py-1 border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                          >
                            {CLAIM_LINE_CHANGE_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          {line.change_type === 'New Item' ? (
                            <select
                              disabled={isReadOnly}
                              value={line.boq_header_id || ''}
                              onChange={(e) => handleLineChange(line.id, 'boq_header_id', e.target.value || null)}
                              className="w-full px-2 py-1 border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-[11px]"
                            >
                              <option value="">Assign BOQ Header</option>
                              {filteredBoqHeaders.map((h) => (
                                <option key={h.id} value={h.id}>
                                  {h.boq_code} - {h.classification || 'General'}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select
                              disabled={isReadOnly}
                              value={line.boq_item_id || ''}
                              onChange={(e) => handleLineChange(line.id, 'boq_item_id', e.target.value || null)}
                              className="w-full px-2 py-1 border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-[11px]"
                            >
                              <option value="">Select BOQ Item</option>
                              {filteredBoqItems.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.item_code} - {b.description?.slice(0, 20)}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            disabled={isReadOnly}
                            value={line.claimed_value || 0}
                            onChange={(e) => handleLineChange(line.id, 'claimed_value', Number(e.target.value))}
                            className="w-20 px-2 py-1 text-right border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            disabled={isReadOnly}
                            value={line.claimed_days || 0}
                            onChange={(e) => handleLineChange(line.id, 'claimed_days', Number(e.target.value))}
                            className="w-16 px-2 py-1 text-right border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            disabled={currentStatus === 'Approved' || currentStatus === 'Converted' || currentStatus === 'Rejected'}
                            value={line.assessed_value || 0}
                            onChange={(e) => handleLineChange(line.id, 'assessed_value', Number(e.target.value))}
                            className="w-20 px-2 py-1 text-right border rounded bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 font-semibold"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            disabled={currentStatus === 'Approved' || currentStatus === 'Converted' || currentStatus === 'Rejected'}
                            value={line.assessed_days || 0}
                            onChange={(e) => handleLineChange(line.id, 'assessed_days', Number(e.target.value))}
                            className="w-16 px-2 py-1 text-right border rounded bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            disabled={currentStatus === 'Approved' || currentStatus === 'Converted' || currentStatus === 'Rejected'}
                            value={line.approved_value || 0}
                            onChange={(e) => handleLineChange(line.id, 'approved_value', Number(e.target.value))}
                            className="w-20 px-2 py-1 text-right border rounded bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-bold"
                          />
                        </td>
                        {!isReadOnly && (
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(line.id)}
                              className="text-rose-500 hover:text-rose-700 p-1 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100/70 dark:bg-slate-800/60 font-bold text-slate-900 dark:text-white">
                      <td colSpan={4} className="p-2.5 text-right">
                        Totals:
                      </td>
                      <td className="p-2.5 text-right">${totals.claimedTotal.toLocaleString()}</td>
                      <td className="p-2.5 text-right">{totals.claimedDaysTotal} d</td>
                      <td className="p-2.5 text-right text-indigo-600 dark:text-indigo-400">
                        ${totals.assessedTotal.toLocaleString()}
                      </td>
                      <td className="p-2.5 text-right text-indigo-600 dark:text-indigo-400">
                        {totals.assessedDaysTotal} d
                      </td>
                      <td className="p-2.5 text-right text-emerald-600 dark:text-emerald-400">
                        ${totals.approvedTotal.toLocaleString()}
                      </td>
                      {!isReadOnly && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: EVIDENCE */}
          {activeTab === 'evidence' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Evidence Notes & Reference Records
                </label>
                <textarea
                  rows={4}
                  disabled={isReadOnly}
                  placeholder="Attach links or references to delay logs, site photos, daily diaries, inspection reports (WIR), or baseline fragment comparisons..."
                  value={formData.evidence_notes || ''}
                  onChange={(e) => setFormData({ ...formData, evidence_notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Linked Document Artifact
                </label>
                <select
                  disabled={isReadOnly}
                  value={formData.linked_document_id || ''}
                  onChange={(e) => setFormData({ ...formData, linked_document_id: e.target.value || null })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="">None / External Document</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.doc_number || d.id} - {d.title || d.file_name || 'Document'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* TAB 4: HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" /> Governed Lifecycle Audit Trace
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-slate-600 dark:text-slate-400">
                  <div>
                    <span className="font-semibold block text-slate-500">Created:</span>
                    {formData.created_at || '—'} (by {formData.owner || 'System'})
                  </div>
                  <div>
                    <span className="font-semibold block text-slate-500">Submitted:</span>
                    {formData.submitted_at ? `${formData.submitted_at} (${formData.submitted_by})` : 'Pending'}
                  </div>
                  <div>
                    <span className="font-semibold block text-slate-500">Assessed:</span>
                    {formData.assessed_at ? `${formData.assessed_at} (${formData.assessed_by})` : 'Pending'}
                  </div>
                  <div>
                    <span className="font-semibold block text-slate-500">Approved:</span>
                    {formData.approved_at ? `${formData.approved_at} (${formData.approved_by})` : 'Pending'}
                  </div>
                </div>

                {formData.converted_variation_id && (
                  <div className="mt-3 p-2 bg-teal-50 dark:bg-teal-950/30 rounded border border-teal-200 dark:border-teal-900 text-teal-800 dark:text-teal-300 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-600" />
                    <span>
                      Converted to Variation Order <strong>ID: {formData.converted_variation_id}</strong> on {formData.converted_at || '—'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Reason Action Prompt Modal */}
        {reasonDialogOpen && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-5 max-w-lg w-full shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base flex items-center gap-2">
                  {reasonDialogOpen === 'reject' ? (
                    <>
                      <XCircle className="w-5 h-5 text-rose-500" /> Reject Claim
                    </>
                  ) : reasonDialogOpen === 'reopen' ? (
                    <>
                      <RotateCcw className="w-5 h-5 text-amber-500" /> Reopen Claim
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-5 h-5 text-blue-500" /> Reverse Claim Conversion
                    </>
                  )}
                </h3>
                <button onClick={() => setReasonDialogOpen(false)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {reasonDialogOpen === 'reopen' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Target Reopening State
                  </label>
                  <select
                    value={reopenTargetStatus}
                    onChange={(e) => setReopenTargetStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  >
                    <option value="Draft">Draft (Editable by Contractor/Owner)</option>
                    <option value="Under Assessment">Under Assessment (Commercial Re-Evaluation)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Justification / Governance Reason *
                </label>
                <textarea
                  rows={3}
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder="State clear reason for this action for the permanent audit trail..."
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReasonDialogOpen(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReasonActionSubmit}
                  disabled={isSubmitting}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-sm transition-colors ${
                    reasonDialogOpen === 'reject'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : reasonDialogOpen === 'reopen'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isSubmitting ? 'Processing...' : 'Confirm Action'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex-wrap gap-2">
          {/* Left Contextual Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {currentStatus === 'Approved' && !formData.converted_variation_id && (
              <button
                type="button"
                onClick={handleConvertToVariation}
                disabled={isSubmitting}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <CheckCircle className="w-4 h-4" /> Convert to Variation Package (PVO)
              </button>
            )}

            {currentStatus === 'Converted' && (
              <button
                type="button"
                onClick={() => {
                  setReasonText('');
                  setReasonDialogOpen('reverse');
                }}
                disabled={isSubmitting}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> Reverse Conversion
              </button>
            )}

            {(currentStatus === 'Submitted' || currentStatus === 'Under Assessment' || currentStatus === 'Assessed') && (
              <button
                type="button"
                onClick={() => {
                  setReasonText('');
                  setReasonDialogOpen('reject');
                }}
                disabled={isSubmitting}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <XCircle className="w-4 h-4" /> Reject Claim
              </button>
            )}

            {currentStatus === 'Rejected' && (
              <button
                type="button"
                onClick={() => {
                  setReasonText('');
                  setReasonDialogOpen('reopen');
                }}
                disabled={isSubmitting}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> Reopen Claim
              </button>
            )}
          </div>

          {/* Right Workflow Progression Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>

            {(currentStatus === 'Draft' || currentStatus === 'Notified') && (
              <>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-semibold transition-colors"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={handleSubmitClaim}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Submit Claim
                </button>
              </>
            )}

            {(currentStatus === 'Submitted' || currentStatus === 'Under Assessment') && (
              <button
                type="button"
                onClick={handleAssessClaim}
                disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Record Assessment
              </button>
            )}

            {currentStatus === 'Assessed' && (
              <button
                type="button"
                onClick={handleApproveClaim}
                disabled={isSubmitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Approve Claim
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
