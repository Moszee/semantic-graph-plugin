import { IHtmlComponent, HtmlBuilder } from './HtmlComponent';
import { IntentNode } from '../../lib/types';

export interface NodeDetailsContentConfig {
    node: IntentNode;
    isEditable: boolean;
}

/**
 * Component for rendering the detailed content of a node in the details panel
 */
export class NodeDetailsContentComponent implements IHtmlComponent {
    constructor(private config: NodeDetailsContentConfig) { }

    render(): string {
        const { node, isEditable } = this.config;

        return `
            ${this.renderAIPromptSection()}
            
            ${this.renderStatusField()}
            
            ${this.renderTextField('ID', node.id, false)}
            
            ${this.renderTextField('Type', node.type, false)}
            
            ${this.renderEditableField('Name', node.id, 'name', node.name, isEditable)}
            
            ${this.renderEditableTextarea('Description', node.id, 'description', node.description || '', isEditable)}
            
            ${this.renderListField('Invariants', node.invariants)}
            
            ${this.renderEntryPointsField(node.entryPoints)}
            
            ${this.renderListField('Inputs', node.inputs, '← ')}
            
            ${this.renderListField('Outputs', node.outputs)}
            
            ${this.renderMetadataField(node.metadata)}
        `;
    }

    private renderAIPromptSection(): string {
        return `
            <div class="ai-prompt-section">
                <textarea 
                    class="ai-prompt-textarea" 
                    id="aiPromptInput"
                    placeholder="Describe how you want to modify this node using AI..."
                    rows="3"
                ></textarea>
                <div class="ai-prompt-actions">
                    <span class="ai-prompt-hint">Ctrl+Enter to send</span>
                    <button class="ai-prompt-send-btn" id="aiPromptSendBtn">
                        Send to AI
                    </button>
                </div>
                <div class="ai-prompt-loading" id="aiPromptLoading" style="display: none; margin-top: 8px;">
                    <div class="spinner"></div>
                    <span>AI is processing...</span>
                </div>
            </div>
        `;
    }

    private renderStatusField(): string {
        const { isEditable } = this.config;
        const badgeClass = isEditable ? 'editable-badge' : 'readonly-badge';
        const statusText = isEditable ? 'Editable' : 'Read-only';

        return `
            <div class="field-group">
                <div class="field-label">Status</div>
                <span class="${badgeClass}">
                    ${statusText}
                </span>
            </div>
        `;
    }

    private renderTextField(label: string, value: string, escape: boolean = true): string {
        const displayValue = escape ? HtmlBuilder.escapeHtml(value) : value;
        return `
            <div class="field-group">
                <div class="field-label">${HtmlBuilder.escapeHtml(label)}</div>
                <div class="field-value">${displayValue}</div>
            </div>
        `;
    }

    private renderEditableField(label: string, nodeId: string, fieldName: string, value: string, isEditable: boolean): string {
        const escapedValue = HtmlBuilder.escapeHtml(value);
        const escapedLabel = HtmlBuilder.escapeHtml(label);

        if (isEditable) {
            return `
                <div class="field-group">
                    <div class="field-label">${escapedLabel}</div>
                    <input 
                        type="text" 
                        class="field-input" 
                        value="${escapedValue}" 
                        onchange="updateNodeField('${HtmlBuilder.escapeHtml(nodeId)}', '${fieldName}', this.value)"
                    >
                </div>
            `;
        } else {
            return this.renderTextField(label, value);
        }
    }

    private renderEditableTextarea(label: string, nodeId: string, fieldName: string, value: string, isEditable: boolean): string {
        const escapedValue = HtmlBuilder.escapeHtml(value);
        const escapedLabel = HtmlBuilder.escapeHtml(label);
        const displayValue = value || 'No description';

        if (isEditable) {
            return `
                <div class="field-group">
                    <div class="field-label">${escapedLabel}</div>
                    <textarea 
                        class="field-input" 
                        rows="3" 
                        onchange="updateNodeField('${HtmlBuilder.escapeHtml(nodeId)}', '${fieldName}', this.value)"
                    >${escapedValue}</textarea>
                </div>
            `;
        } else {
            return `
                <div class="field-group">
                    <div class="field-label">${escapedLabel}</div>
                    <div class="field-value">${HtmlBuilder.escapeHtml(displayValue)}</div>
                </div>
            `;
        }
    }

    private renderListField(label: string, items: string[] | undefined, prefix: string = ''): string {
        if (!items || items.length === 0) {
            return '';
        }

        const escapedLabel = HtmlBuilder.escapeHtml(label);
        const itemsHtml = items
            .map(item => `<div class="field-list-item">${prefix}${HtmlBuilder.escapeHtml(item)}</div>`)
            .join('');

        return `
            <div class="field-group">
                <div class="field-label">${escapedLabel}</div>
                <div class="field-list">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }

    private renderEntryPointsField(entryPoints: Array<{ type: string; name: string }> | undefined): string {
        if (!entryPoints || entryPoints.length === 0) {
            return '';
        }

        const itemsHtml = entryPoints
            .map(ep => `<div class="field-list-item">${HtmlBuilder.escapeHtml(ep.type)}: ${HtmlBuilder.escapeHtml(ep.name)}</div>`)
            .join('');

        return `
            <div class="field-group">
                <div class="field-label">Entry Points</div>
                <div class="field-list">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }

    private renderMetadataField(metadata: Record<string, string> | undefined): string {
        if (!metadata || Object.keys(metadata).length === 0) {
            return '';
        }

        const itemsHtml = Object.entries(metadata)
            .map(([key, value]) =>
                `<div class="field-list-item"><strong>${HtmlBuilder.escapeHtml(key)}:</strong> ${HtmlBuilder.escapeHtml(value)}</div>`
            )
            .join('');

        return `
            <div class="field-group">
                <div class="field-label">Metadata</div>
                <div class="field-list">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }
}
