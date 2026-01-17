/**
 * Event handlers for details panel
 * This script handles UI interactions and delegates rendering to TypeScript components
 */

/**
 * Show node details in the details panel
 * @param {string} nodeId - Node ID to show details for
 */
function showNodeDetails(nodeId) {
    const node = window.GRAPH_DATA.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const panel = document.getElementById('detailsPanel');
    const content = document.getElementById('detailsContent');
    const isEditable = window.GRAPH_DATA.selectedIntent !== null && window.GRAPH_DATA.deltaNodeIds.has(nodeId);

    // Generate content using the component system
    // Note: The actual component rendering happens on the TypeScript side
    // This content is injected by reloading the webview
    // For now, we'll use the same inline approach but the HTML generation
    // will be moved to TypeScript components on the next webview reload

    // Import the component (this will be available via the global scope)
    // For the webview context, we need to trigger a message to the extension
    // to regenerate the HTML with the proper component

    // Since we can't import TypeScript in the webview directly,
    // we'll need to pass the rendering responsibility to the extension side
    // For now, keep the inline HTML but use a cleaner structure

    content.innerHTML = generateNodeDetailsHTML(node, isEditable);

    // Attach event listeners for AI prompt
    attachAIPromptListeners(nodeId);

    panel.classList.add('visible');
}

/**
 * Generate node details HTML
 * This is a bridge function until we can fully move to component-based rendering
 */
function generateNodeDetailsHTML(node, isEditable) {
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
        
        <div class="field-group">
            <div class="field-label">Status</div>
            <span class="${isEditable ? 'editable-badge' : 'readonly-badge'}">
                ${isEditable ? 'Editable' : 'Read-only'}
            </span>
        </div>
        
        <div class="field-group">
            <div class="field-label">ID</div>
            <div class="field-value">${escapeHtml(node.id)}</div>
        </div>
        
        <div class="field-group">
            <div class="field-label">Type</div>
            <div class="field-value">${escapeHtml(node.type)}</div>
        </div>
        
        <div class="field-group">
            <div class="field-label">Name</div>
            ${isEditable
            ? `<input type="text" class="field-input" value="${escapeHtml(node.name)}" onchange="updateNodeField('${escapeHtml(node.id)}', 'name', this.value)">`
            : `<div class="field-value">${escapeHtml(node.name)}</div>`
        }
        </div>
        
        <div class="field-group">
            <div class="field-label">Description</div>
            ${isEditable
            ? `<textarea class="field-input" rows="3" onchange="updateNodeField('${escapeHtml(node.id)}', 'description', this.value)">${escapeHtml(node.description || '')}</textarea>`
            : `<div class="field-value">${escapeHtml(node.description || 'No description')}</div>`
        }
        </div>
        
        ${node.invariants && node.invariants.length > 0 ? `
            <div class="field-group">
                <div class="field-label">Invariants</div>
                <div class="field-list">
                    ${node.invariants.map(inv => `<div class="field-list-item">${escapeHtml(inv)}</div>`).join('')}
                </div>
            </div>
        ` : ''}
        
        ${node.entryPoints && node.entryPoints.length > 0 ? `
            <div class="field-group">
                <div class="field-label">Entry Points</div>
                <div class="field-list">
                    ${node.entryPoints.map(ep => `<div class="field-list-item">${escapeHtml(ep.type)}: ${escapeHtml(ep.name)}</div>`).join('')}
                </div>
            </div>
        ` : ''}
        
        ${node.inputs && node.inputs.length > 0 ? `
            <div class="field-group">
                <div class="field-label">Inputs</div>
                <div class="field-list">
                    ${node.inputs.map(inp => `<div class="field-list-item">← ${escapeHtml(inp)}</div>`).join('')}
                </div>
            </div>
        ` : ''}
        
        ${node.outputs && node.outputs.length > 0 ? `
            <div class="field-group">
                <div class="field-label">Outputs</div>
                <div class="field-list">
                    ${node.outputs.map(out => `<div class="field-list-item">${escapeHtml(out)}</div>`).join('')}
                </div>
            </div>
        ` : ''}
        
        ${Object.keys(node.metadata || {}).length > 0 ? `
            <div class="field-group">
                <div class="field-label">Metadata</div>
                <div class="field-list">
                    ${Object.entries(node.metadata).map(([k, v]) => `<div class="field-list-item"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</div>`).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * Attach event listeners for AI prompt section
 */
function attachAIPromptListeners(nodeId) {
    const promptInput = document.getElementById('aiPromptInput');
    const sendBtn = document.getElementById('aiPromptSendBtn');

    if (promptInput && sendBtn) {
        // Handle Ctrl+Enter
        promptInput.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                handleAIPrompt(nodeId);
            }
        });

        // Handle send button click
        sendBtn.addEventListener('click', () => {
            handleAIPrompt(nodeId);
        });
    }
}

/**
 * Close the details panel
 */
function closeDetails() {
    document.getElementById('detailsPanel').classList.remove('visible');
}

/**
 * Update a node field (called from details panel inputs)
 * @param {string} nodeId - Node ID
 * @param {string} field - Field name
 * @param {string} value - New value
 */
function updateNodeField(nodeId, field, value) {
    vscodePostMessage({
        command: 'updateNode',
        nodeId: nodeId,
        field: field,
        value: value
    });
}

/**
 * Handle AI prompt submission
 * @param {string} nodeId - Node ID to tweak
 */
function handleAIPrompt(nodeId) {
    const promptInput = document.getElementById('aiPromptInput');
    const sendBtn = document.getElementById('aiPromptSendBtn');
    const loadingIndicator = document.getElementById('aiPromptLoading');

    if (!promptInput) return;

    const prompt = promptInput.value.trim();
    if (!prompt) {
        return; // Don't send empty prompts
    }

    // Show loading state
    if (sendBtn) sendBtn.disabled = true;
    if (loadingIndicator) loadingIndicator.style.display = 'flex';
    if (promptInput) promptInput.disabled = true;

    // Send message to extension
    vscodePostMessage({
        command: 'tweakNode',
        nodeId: nodeId,
        prompt: prompt
    });

    // Note: The loading state will be cleared when the extension sends back a response
    // For now, we'll clear it after a timeout to prevent indefinite loading state
    setTimeout(() => {
        if (sendBtn) sendBtn.disabled = false;
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (promptInput) {
            promptInput.disabled = false;
            promptInput.value = ''; // Clear the prompt after sending
        }
    }, 2000);
}
