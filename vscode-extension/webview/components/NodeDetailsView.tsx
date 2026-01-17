import { h } from 'preact';
import { IntentNode } from '../types';
import { FieldGroupView } from './FieldGroupView';
import { AIPromptView } from './AIPromptView';

interface NodeDetailsViewProps {
    node: IntentNode;
    isEditable: boolean;
    aiPrompt: string;
    isLoading: boolean;
    onAIPromptChange: (value: string) => void;
    onAISubmit: () => void;
    onAIKeyDown: (e: KeyboardEvent) => void;
    onFieldUpdate: (field: string, value: string) => void;
}

export function NodeDetailsView({
    node,
    isEditable,
    aiPrompt,
    isLoading,
    onAIPromptChange,
    onAISubmit,
    onAIKeyDown,
    onFieldUpdate,
}: NodeDetailsViewProps) {
    return (
        <div class="details-content">
            {/* AI Prompt Section */}
            <AIPromptView
                value={aiPrompt}
                isLoading={isLoading}
                onChange={onAIPromptChange}
                onSubmit={onAISubmit}
                onKeyDown={onAIKeyDown}
            />

            {/* Status Badge */}
            <FieldGroupView label="Status">
                <span class={isEditable ? 'editable-badge' : 'readonly-badge'}>
                    {isEditable ? 'Editable' : 'Read-only'}
                </span>
            </FieldGroupView>

            {/* ID */}
            <FieldGroupView label="ID">
                <div class="field-value">{node.id}</div>
            </FieldGroupView>

            {/* Type */}
            <FieldGroupView label="Type">
                <div class="field-value">{node.type}</div>
            </FieldGroupView>

            {/* Name - Editable */}
            <FieldGroupView label="Name">
                {isEditable ? (
                    <input
                        type="text"
                        class="field-input"
                        value={node.name}
                        onChange={(e) => onFieldUpdate('name', (e.target as HTMLInputElement).value)}
                    />
                ) : (
                    <div class="field-value">{node.name}</div>
                )}
            </FieldGroupView>

            {/* Description - Editable */}
            <FieldGroupView label="Description">
                {isEditable ? (
                    <textarea
                        class="field-input"
                        rows={3}
                        value={node.description || ''}
                        onChange={(e) => onFieldUpdate('description', (e.target as HTMLTextAreaElement).value)}
                    />
                ) : (
                    <div class="field-value">{node.description || 'No description'}</div>
                )}
            </FieldGroupView>

            {/* Invariants */}
            {node.invariants && node.invariants.length > 0 && (
                <FieldGroupView label="Invariants">
                    <div class="field-list">
                        {node.invariants.map((inv) => (
                            <div class="field-list-item">{inv}</div>
                        ))}
                    </div>
                </FieldGroupView>
            )}

            {/* Questions */}
            {node.questions && node.questions.length > 0 && (
                <FieldGroupView label="Questions">
                    <div class="field-list field-list-questions">
                        {node.questions.map((q) => (
                            <div class="field-list-item field-list-item-question">❓ {q}</div>
                        ))}
                    </div>
                </FieldGroupView>
            )}

            {/* Entry Points */}
            {node.entryPoints && node.entryPoints.length > 0 && (
                <FieldGroupView label="Entry Points">
                    <div class="field-list">
                        {node.entryPoints.map((ep) => (
                            <div class="field-list-item">
                                {ep.type}: {ep.name}
                            </div>
                        ))}
                    </div>
                </FieldGroupView>
            )}

            {/* Inputs */}
            {node.inputs && node.inputs.length > 0 && (
                <FieldGroupView label="Inputs">
                    <div class="field-list">
                        {node.inputs.map((inp) => (
                            <div class="field-list-item">← {inp}</div>
                        ))}
                    </div>
                </FieldGroupView>
            )}

            {/* Outputs */}
            {node.outputs && node.outputs.length > 0 && (
                <FieldGroupView label="Outputs">
                    <div class="field-list">
                        {node.outputs.map((out) => (
                            <div class="field-list-item">{out}</div>
                        ))}
                    </div>
                </FieldGroupView>
            )}

            {/* Metadata */}
            {node.metadata && Object.keys(node.metadata).length > 0 && (
                <FieldGroupView label="Metadata">
                    <div class="field-list">
                        {Object.entries(node.metadata).map(([key, value]) => (
                            <div class="field-list-item">
                                <strong>{key}:</strong> {value}
                            </div>
                        ))}
                    </div>
                </FieldGroupView>
            )}
        </div>
    );
}
