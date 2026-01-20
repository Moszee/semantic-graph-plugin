/**
 * DOM manipulation for node rendering
 */

/**
 * Render all nodes
 * @param {Array} nodes - Array of node objects
 * @param {Set} deltaNodeIds - Set of node IDs that are in the delta
 */
function renderNodes(nodes, deltaNodeIds) {
    const graph = document.getElementById('graph');
    graph.innerHTML = '';

    if (nodes.length === 0) {
        // Show empty state message based on whether an intent is selected
        if (!window.GRAPH_DATA || !window.GRAPH_DATA.selectedIntent) {
            graph.innerHTML = `
                <div class="empty-state">
                    <h2>No nodes yet</h2>
                    <p>Create a .intent-graph/nodes directory with YAML files to get started.</p>
                </div>
            `;
        } else {
            // Show intent info when graph is empty but intent is selected
            const intent = window.GRAPH_DATA.selectedIntent;
            graph.innerHTML = `
                <div class="empty-state">
                    <h2>Intent: ${intent.name}</h2>
                    <p>${intent.description || 'No description'}</p>
                    <p class="empty-state-hint">This intent has no nodes yet. Use the AI prompt to add nodes to this intent.</p>
                </div>
            `;
        }
        return;
    }

    nodes.forEach(node => {
        const pos = getNodePosition(node.id);
        const isAdded = deltaNodeIds.has(node.id);
        const selected = getSelectedNodeId();
        const nodeEl = renderSingleNode(node, pos, isAdded, selected === node.id);

        // Node click/drag events
        nodeEl.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            startNodeDrag(e, nodeEl, node.id);
        });

        graph.appendChild(nodeEl);
    });
}

/**
 * Render a single node element
 * @param {Object} node - Node object
 * @param {Object} pos - Position {x, y}
 * @param {boolean} isAdded - Whether node is in delta
 * @param {boolean} isSelected - Whether node is selected
 * @returns {HTMLElement} Node element
 */
function renderSingleNode(node, pos, isAdded, isSelected) {
    const nodeEl = document.createElement('div');
    nodeEl.className = 'node'
        + (isAdded ? ' added' : '')
        + (isSelected ? ' selected' : '')
        + ' type-' + node.type;
    nodeEl.dataset.id = node.id;
    nodeEl.style.left = pos.x + 'px';
    nodeEl.style.top = pos.y + 'px';

    const hasQuestions = node.questions && node.questions.length > 0;

    nodeEl.innerHTML = `
        ${hasQuestions ? '<div class="node-questions-indicator" title="Has open questions"></div>' : ''}
        <div class="node-type">${node.type}</div>
        <div class="node-name">${node.name}</div>
        <div class="node-description">${node.description || ''}</div>
        ${(node.inputs && node.inputs.length > 0) || (node.outputs && node.outputs.length > 0) ? `
            <div class="node-connections">
                ${node.inputs?.map(i => `<span class="connection-label connection-input">← ${i}</span>`).join('') || ''}
                ${node.outputs?.map(o => `<span class="connection-label connection-output">${o} →</span>`).join('') || ''}
            </div>
        ` : ''}
    `;

    return nodeEl;
}

/**
 * Update node selection styling
 */
function updateNodeSelection() {
    const selected = getSelectedNodeId();
    document.querySelectorAll('.node').forEach(el => {
        if (el.dataset.id === selected) {
            el.classList.add('selected');
        } else {
            el.classList.remove('selected');
        }
    });
}
