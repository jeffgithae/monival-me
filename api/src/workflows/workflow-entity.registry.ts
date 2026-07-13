/**
 * Central registry of every entity type a workflow can govern.
 *
 * Adding workflow support for a new entity is one entry here:
 *  - `modelName`   — the mongoose model name (resolved at runtime via
 *                    `connection.model()`, so this module never imports other
 *                    feature modules and cannot create dependency cycles).
 *  - `titleFields` — candidate fields, first non-empty becomes the instance
 *                    title when the caller doesn't supply one.
 *  - `outcome`     — optional: how a finished workflow writes back to the
 *                    entity (approve/reject → status value). Types without an
 *                    approval-shaped status field simply omit it; the workflow
 *                    instance itself remains the record of the decision.
 *
 * Feature services can override the generic outcome write-back with richer
 * logic (side effects, linked-total syncing, notifications) by calling
 * `WorkflowService.registerOutcomeHandler(entityType, handler)` — see
 * ActivitiesService for the pattern.
 */

export interface WorkflowEntityOutcome {
  statusField: string;
  approved: string;
  rejected: string;
}

export interface WorkflowEntityConfig {
  label: string;
  modelName: string;
  titleFields: string[];
  outcome?: WorkflowEntityOutcome;
}

export const WORKFLOW_ENTITY_REGISTRY: Record<string, WorkflowEntityConfig> = {
  activity: {
    label: 'Activity',
    modelName: 'Activity',
    titleFields: ['title'],
    outcome: { statusField: 'status', approved: 'approved', rejected: 'rejected' },
  },
  report: {
    label: 'Reporting Period',
    modelName: 'ReportingPeriod',
    titleFields: ['name'],
    // Rejection reopens the period for revision rather than dead-ending it.
    outcome: { statusField: 'status', approved: 'approved', rejected: 'open' },
  },
  grant: {
    label: 'Grant',
    modelName: 'Grant',
    titleFields: ['title', 'name'],
    outcome: { statusField: 'status', approved: 'awarded', rejected: 'rejected' },
  },
  budget: {
    label: 'Budget Allocation',
    modelName: 'BudgetAllocation',
    titleFields: ['name', 'title'],
    // BudgetStatus has no 'rejected' — a rejected budget returns to draft.
    outcome: { statusField: 'status', approved: 'approved', rejected: 'draft' },
  },
  document: {
    label: 'Document',
    modelName: 'Document',
    titleFields: ['title', 'fileName'],
  },
  beneficiary: {
    label: 'Beneficiary',
    modelName: 'Beneficiary',
    titleFields: ['name', 'caseId'],
  },
  indicator_result: {
    label: 'Indicator Result',
    modelName: 'IndicatorResult',
    titleFields: ['narrative'],
  },
  project: {
    label: 'Project',
    modelName: 'Project',
    titleFields: ['name'],
  },
  form_response: {
    label: 'Form Response',
    modelName: 'FormResponse',
    titleFields: [],
  },
  feedback: {
    label: 'Stakeholder Feedback',
    modelName: 'StakeholderFeedback',
    titleFields: ['title', 'summary'],
  },
  okr: {
    label: 'OKR',
    modelName: 'OKR',
    titleFields: ['objective', 'title', 'name'],
  },
  donor: {
    label: 'Donor',
    modelName: 'Donor',
    titleFields: ['name'],
  },
  partner: {
    label: 'Partner',
    modelName: 'Partner',
    titleFields: ['name'],
  },
};

export const WORKFLOW_ENTITY_TYPES = Object.keys(WORKFLOW_ENTITY_REGISTRY);

/**
 * Kept as a string union (not an enum) so new registry entries don't require
 * schema/DTO edits. `(string & {})` keeps forward-compat with types added at
 * runtime while still hinting the known keys.
 */
export type WorkflowEntityType = keyof typeof WORKFLOW_ENTITY_REGISTRY | (string & {});
