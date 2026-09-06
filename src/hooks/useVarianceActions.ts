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
    };

    try {
      await dataRepository.insert<VarianceActionItem>('variance_actions', newAction);
    } catch (e) {
      console.warn("Could not insert action into SQLite table, performing state-only insertion", e);
    }

    if (applyLocalMutation) {
      applyLocalMutation('variance_actions', { type: 'insert', row: newAction });
    } else {
      setLocalActions((prev) => [...prev, newAction]);
    }
    
    return newAction;
  };

  const handleUpdateActionStatus = async (
    id: string,
    status: 'Open' | 'In Progress' | 'Closed',
    evidence?: string,
    comments?: string
  ) => {
    // Find the item
    const existing = varianceActionItems.find((item) => item.id === id);
    if (!existing) return;

    // Prevent closing without evidence!
    if (status === 'Closed') {
      const existingEvidence = existing.evidence || '';
      const providedEvidence = evidence || '';
      if (!existingEvidence.trim() && !providedEvidence.trim()) {
        throw new Error('الرجاء تقديم دليل إثبات المعالجة والحل لإغلاق بند الانحراف (Evidence is required to close this variance action).');
      }
    }

    const updated: VarianceActionItem = {
      ...existing,
      status,
      evidence: evidence !== undefined ? evidence : existing.evidence,
      comments: comments !== undefined ? comments : existing.comments,
      updated_at: new Date().toISOString(),
    };

    try {
      await dataRepository.update<VarianceActionItem>('variance_actions', id, updated);
    } catch (e) {
      console.warn("Could not update action in SQLite, performing state-only update", e);
    }

    if (applyLocalMutation) {
      applyLocalMutation('variance_actions', { type: 'update', row: updated });
    } else {
      setLocalActions((prev) => prev.map((item) => (item.id === id ? updated : item)));
    }
  };

  const handleEscalateAction = async (id: string, reason: string) => {
    const existing = varianceActionItems.find((item) => item.id === id);
    if (!existing) return;

    const currentLevel = existing.escalation_level || 0;
    const newLevel = currentLevel + 1;
    const dateStr = new Date().toLocaleDateString();
    const newHistory = `${existing.escalation_history || ''}\n[${dateStr}] Escalated to Level ${newLevel}: ${reason}`.trim();

    const updated: VarianceActionItem = {
      ...existing,
      escalation_level: newLevel,
      escalation_history: newHistory,
      updated_at: new Date().toISOString(),
    };

    try {
      await dataRepository.update<VarianceActionItem>('variance_actions', id, updated);
    } catch (e) {
      console.warn("Could not escalate action in SQLite, performing state-only update", e);
    }

    if (applyLocalMutation) {
      applyLocalMutation('variance_actions', { type: 'update', row: updated });
    } else {
      setLocalActions((prev) => prev.map((item) => (item.id === id ? updated : item)));
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
