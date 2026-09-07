import { useState, useEffect } from 'react';
import { VarianceActionItem } from '@/types';
import { createActionFromWarning, Warning } from '@/utils/varianceActionRegister';
import { dataRepository } from '@/data';

export function useVarianceActions(
  externalActions?: VarianceActionItem[],
  applyLocalMutation?: (tableName: string, mutation: any) => void
) {
  const [localActions, setLocalActions] = useState<VarianceActionItem[]>([]);

  // Keep local state in sync if external actions are not provided or fall back
  const varianceActionItems = externalActions !== undefined ? externalActions : localActions;

  // Load from database if no externalActions provided (backward-compatible / independent use)
  useEffect(() => {
    if (externalActions === undefined) {
      dataRepository.list<VarianceActionItem>('variance_actions')
        .then((items) => setLocalActions(items || []))
        .catch(() => {
          // If table doesn't exist, fallback to empty
          setLocalActions([]);
        });
    }
  }, [externalActions]);

  const handleCreateAction = async (
    warning: Warning,
    assignedTo: string,
    dueDate: string,
    project_id: string = '',
    contract_id: string | null = null,
    severity?: 'Low' | 'Medium' | 'High' | 'Critical',
    materiality: number = 0,
    source_kpi: string = '',
    source_record_id: string | null = null
  ) => {
    if (!project_id.trim()) throw new Error('Variance action requires a project scope.');
    if (!assignedTo.trim()) throw new Error('Variance action requires an assigned owner.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('Variance action requires a valid due date.');
    const duplicate = varianceActionItems.find((item) => item.project_id === project_id
      && item.source_kpi === (source_kpi || warning.category)
      && String(item.source_record_id || '') === String(source_record_id || '')
      && item.status !== 'Closed');
    if (duplicate) throw new Error('An open action already exists for this variance source.');
    const baseAction = createActionFromWarning(
      warning,
      project_id,
      contract_id,
      source_kpi,
      source_record_id,
      materiality
    );
    
    const newAction: VarianceActionItem = {
      ...baseAction,
      assignedTo,
      dueDate,
      severity: severity || baseAction.severity,
      status: 'Assigned',
      status_history: `[${new Date().toISOString()}] Open → Assigned by ${assignedTo}`,
    };

    const inserted = await dataRepository.insert<VarianceActionItem>('variance_actions', newAction);

    if (applyLocalMutation) {
      applyLocalMutation('variance_actions', { type: 'insert', row: inserted });
    } else {
      setLocalActions((prev) => [...prev, inserted]);
    }
    
    return newAction;
  };

  const handleUpdateActionStatus = async (
    id: string,
    status: 'Open' | 'Assigned' | 'In Progress' | 'Resolved' | 'Closed',
    evidence?: string,
    comments?: string
  ) => {
    // Find the item
    const existing = varianceActionItems.find((item) => item.id === id);
    if (!existing) return;
    if (existing.status === 'Closed') throw new Error('Closed variance actions are immutable.');
    const allowedTransitions: Record<VarianceActionItem['status'], VarianceActionItem['status'][]> = {
      Open: ['Assigned'],
      Assigned: ['In Progress'],
      'In Progress': ['Resolved'],
      Resolved: ['In Progress', 'Closed'],
      Closed: [],
    };
    if (status !== existing.status && !allowedTransitions[existing.status].includes(status)) {
      throw new Error(`Invalid variance-action transition: ${existing.status} → ${status}.`);
    }

    if (status === 'Resolved' && !String(comments || '').trim()) {
      throw new Error('A resolution statement is required before resolving the action.');
    }

    // Prevent closing without evidence!
    if (status === 'Closed') {
      const existingEvidence = existing.evidence || '';
      const providedEvidence = evidence || '';
      if (!existingEvidence.trim() && !providedEvidence.trim()) {
        throw new Error('الرجاء تقديم دليل إثبات المعالجة والحل لإغلاق بند الانحراف (Evidence is required to close this variance action).');
      }
      if (!String(existing.resolution || comments || '').trim()) {
        throw new Error('A documented resolution is required before closing the action.');
      }
    }

    const updated: VarianceActionItem = {
      ...existing,
      status,
      evidence: evidence !== undefined ? evidence : existing.evidence,
      comments: comments !== undefined ? comments : existing.comments,
      resolution: status === 'Resolved' || status === 'Closed' ? (comments || existing.resolution || '') : existing.resolution,
      status_history: status === existing.status
        ? existing.status_history
        : `${existing.status_history || ''}\n[${new Date().toISOString()}] ${existing.status} → ${status}`.trim(),
      updated_at: new Date().toISOString(),
    };

    const persisted = await dataRepository.update<VarianceActionItem>('variance_actions', id, updated);

    if (applyLocalMutation) {
      applyLocalMutation('variance_actions', { type: 'update', row: persisted });
    } else {
      setLocalActions((prev) => prev.map((item) => (item.id === id ? persisted : item)));
    }
  };

  const handleEscalateAction = async (id: string, reason: string) => {
    const existing = varianceActionItems.find((item) => item.id === id);
    if (!existing) return;
    if (existing.status === 'Closed') throw new Error('Closed variance actions cannot be escalated.');
    if (!reason.trim()) throw new Error('Escalation requires a reason.');

    const currentLevel = existing.escalation_level || 0;
    const newLevel = Math.min(3, currentLevel + 1);
    if (currentLevel >= 3) throw new Error('Variance action is already at the maximum escalation level.');
    const dateStr = new Date().toISOString();
    const newHistory = `${existing.escalation_history || ''}\n[${dateStr}] Escalated to Level ${newLevel}: ${reason}`.trim();

    const updated: VarianceActionItem = {
      ...existing,
      escalation_level: newLevel,
      escalation_history: newHistory,
      updated_at: new Date().toISOString(),
    };

    const persisted = await dataRepository.update<VarianceActionItem>('variance_actions', id, updated);

    if (applyLocalMutation) {
      applyLocalMutation('variance_actions', { type: 'update', row: persisted });
    } else {
      setLocalActions((prev) => prev.map((item) => (item.id === id ? persisted : item)));
    }
  };

  return {
    varianceActionItems,
    setVarianceActionItems: externalActions === undefined ? setLocalActions : () => {},
    handleCreateAction,
    handleUpdateActionStatus,
    handleEscalateAction,
  };
}
