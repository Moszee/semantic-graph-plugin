import * as vscode from 'vscode';
import { GraphStore } from '../store/GraphStore';
import { Logger } from '../lib/Logger';

/**
 * Webview panel for graph visualization.
 */
export class IntentGraphPanel {
    public static currentPanel: IntentGraphPanel | undefined;
    public static readonly viewType = 'intentGraphVisualization';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _store: GraphStore;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, store: GraphStore) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (IntentGraphPanel.currentPanel) {
            Logger.debug('IntentGraphPanel', 'Revealing existing panel');
            IntentGraphPanel.currentPanel._panel.reveal(column);
            IntentGraphPanel.currentPanel._update();
            return;
        }

        Logger.info('IntentGraphPanel', 'Creating new Intent Graph panel');
        const panel = vscode.window.createWebviewPanel(
            IntentGraphPanel.viewType,
            'Intent Graph',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        IntentGraphPanel.currentPanel = new IntentGraphPanel(panel, extensionUri, store);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, store: GraphStore) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._store = store;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                Logger.debug('IntentGraphPanel', 'Received webview message', { command: message.command });
                switch (message.command) {
                    case 'newIntention':
                        Logger.info('IntentGraphPanel', 'Webview triggered new intention command');
                        vscode.commands.executeCommand('intentGraph.newIntention');
                        break;
                    case 'implement':
                        Logger.info('IntentGraphPanel', 'Webview triggered implement command', { intentName: message.intentName });
                        vscode.commands.executeCommand('intentGraph.implement', message.intentName);
                        break;
                    case 'discard':
                        Logger.info('IntentGraphPanel', 'Webview triggered discard command', { intentName: message.intentName });
                        vscode.commands.executeCommand('intentGraph.discard', message.intentName);
                        break;
                    case 'selectNode':
                        Logger.debug('IntentGraphPanel', 'Node selected in webview', { nodeId: message.nodeId });
                        // Handle node selection - already handled in webview
                        break;
                    case 'updateNode':
                        Logger.info('IntentGraphPanel', 'Node update requested from webview', {
                            nodeId: message.nodeId,
                            field: message.field
                        });
                        // Handle node update from details panel
                        this._handleNodeUpdate(message.nodeId, message.field, message.value);
                        break;
                    default:
                        Logger.warn('IntentGraphPanel', 'Unknown webview command received', { command: message.command });
                        break;
                }
            },
            null,
            this._disposables
        );

        this._store.onDidChange(() => this._update(), null, this._disposables);
    }

    private _handleNodeUpdate(nodeId: string, field: string, value: string) {
        const selectedIntent = this._store.getSelectedIntent();
        if (!selectedIntent) {
            Logger.warn('IntentGraphPanel', 'Node update attempted with no intent selected', { nodeId, field });
            return;
        }

        // Find the operation for this node in the selected intent
        const operation = selectedIntent.operations.find(op => op.node.id === nodeId);
        if (!operation) {
            Logger.warn('IntentGraphPanel', 'Node update attempted for node not in selected intent', {
                nodeId,
                field,
                intentName: selectedIntent.name
            });
            return;
        }

        Logger.debug('IntentGraphPanel', 'Updating node field', { nodeId, field, value });
        // Update the field value
        switch (field) {
            case 'name':
                operation.node.name = value;
                break;
            case 'description':
                operation.node.description = value;
                break;
        }

        // Save the updated intent
        this._store.saveIntent(selectedIntent);
        Logger.info('IntentGraphPanel', 'Node updated and intent saved', {
            nodeId,
            field,
            intentName: selectedIntent.name
        });
    }

    public dispose() {
        Logger.debug('IntentGraphPanel', 'Disposing Intent Graph panel');
        IntentGraphPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.title = 'Intent Graph';
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nodes = this._store.getMergedNodes();
        const selectedIntent = this._store.getSelectedIntent();

        // Get IDs of nodes that belong to the selected delta (editable)
        const deltaNodeIds = new Set<string>();
        if (selectedIntent) {
            selectedIntent.operations.forEach(op => {
                deltaNodeIds.add(op.node.id);
            });
        }

        const nodesJson = JSON.stringify(nodes.map(node => ({
            id: node.id,
            type: node.type,
            name: node.name,
            description: node.description,
            invariants: node.invariants || [],
            entryPoints: node.entryPoints || [],
            inputs: node.inputs || [],
            outputs: node.outputs || [],
            metadata: node.metadata || {}
        })));

        const intentJson = selectedIntent ? JSON.stringify(selectedIntent) : 'null';
        const deltaNodeIdsJson = JSON.stringify(Array.from(deltaNodeIds));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Intent Graph</title>
    <style>
        :root {
            --bg-primary: #1e1e1e;
            --bg-secondary: #252526;
            --bg-tertiary: #2d2d2d;
            --border-color: #3c3c3c;
            --text-primary: #cccccc;
            --text-secondary: #858585;
            --accent-blue: #007acc;
            --accent-green: #4caf50;
            --accent-red: #f44336;
            --edge-color: #555555;
            --edge-uses: #4fc3f7;
            --edge-triggers: #ff8a65;
            --edge-filters: #aed581;
            --edge-produces: #ba68c8;
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            height: 100vh;
            overflow: hidden;
        }
        
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        
        .toolbar {
            display: flex;
            gap: 8px;
            padding: 12px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            flex-shrink: 0;
        }
        
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: opacity 0.2s;
        }
        
        .btn:hover {
            opacity: 0.85;
        }
        
        .btn-primary {
            background: var(--accent-blue);
            color: white;
        }
        
        .btn-success {
            background: var(--accent-green);
            color: white;
        }
        
        .btn-danger {
            background: var(--accent-red);
            color: white;
        }
        
        .main-content {
            display: flex;
            flex: 1;
            overflow: hidden;
        }
        
        .canvas-container {
            flex: 1;
            position: relative;
            overflow: auto;
            cursor: grab;
        }
        
        .canvas-container.panning {
            cursor: grabbing;
        }
        
        .graph-wrapper {
            position: relative;
            min-width: 2000px;
            min-height: 2000px;
            transform-origin: 0 0;
        }
        
        #edges-svg {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
        }
        
        .edge {
            fill: none;
            stroke: var(--edge-color);
            stroke-width: 2;
        }
        
        .edge-arrow {
            fill: var(--edge-color);
        }
        
        .node {
            position: absolute;
            background: var(--bg-secondary);
            border: 2px solid var(--border-color);
            border-radius: 8px;
            padding: 16px;
            width: 250px;
            cursor: move;
            transition: border-color 0.2s, box-shadow 0.2s;
            user-select: none;
            z-index: 1;
        }
        
        .node:hover {
            border-color: var(--accent-blue);
        }
        
        .node.selected {
            border-color: var(--accent-blue);
            box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.3);
        }
        
        .node.added {
            border-color: var(--accent-green);
            background: rgba(76, 175, 80, 0.1);
        }
        
        .node.removed {
            border-color: var(--accent-red);
            border-style: dashed;
            opacity: 0.6;
        }
        
        .node.dragging {
            z-index: 100;
            opacity: 0.9;
        }
        
        .node-type {
            font-size: 11px;
            text-transform: uppercase;
            color: var(--accent-blue);
            margin-bottom: 4px;
        }
        
        .node-name {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .node-description {
            font-size: 12px;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }
        
        .node-connections {
            font-size: 11px;
            color: var(--text-secondary);
            border-top: 1px solid var(--border-color);
            padding-top: 8px;
            margin-top: 8px;
        }
        
        .connection-label {
            display: inline-block;
            background: var(--bg-primary);
            padding: 2px 6px;
            border-radius: 3px;
            margin: 2px;
            font-size: 10px;
        }
        
        .connection-input {
            color: var(--accent-blue);
            border: 1px solid var(--accent-blue);
        }
        
        .connection-output {
            color: var(--accent-green);
            border: 1px solid var(--accent-green);
        }
        
        /* Details Panel */
        .details-panel {
            width: 350px;
            background: var(--bg-secondary);
            border-left: 1px solid var(--border-color);
            overflow-y: auto;
            flex-shrink: 0;
            display: none;
        }
        
        .details-panel.visible {
            display: block;
        }
        
        .details-header {
            padding: 16px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .details-header h3 {
            font-size: 14px;
            font-weight: 600;
        }
        
        .close-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 18px;
            padding: 4px 8px;
        }
        
        .close-btn:hover {
            color: var(--text-primary);
        }
        
        .details-content {
            padding: 16px;
        }
        
        .field-group {
            margin-bottom: 16px;
        }
        
        .field-label {
            font-size: 11px;
            text-transform: uppercase;
            color: var(--text-secondary);
            margin-bottom: 4px;
        }
        
        .field-value {
            font-size: 13px;
            color: var(--text-primary);
            background: var(--bg-tertiary);
            padding: 8px;
            border-radius: 4px;
            border: 1px solid var(--border-color);
        }
        
        .field-input {
            width: 100%;
            font-size: 13px;
            color: var(--text-primary);
            background: var(--bg-tertiary);
            padding: 8px;
            border-radius: 4px;
            border: 1px solid var(--border-color);
            resize: vertical;
        }
        
        .field-input:focus {
            outline: none;
            border-color: var(--accent-blue);
        }
        
        .field-input:disabled {
            opacity: 0.7;
            cursor: not-allowed;
        }
        
        .field-list {
            font-size: 12px;
            color: var(--text-secondary);
        }
        
        .field-list-item {
            background: var(--bg-primary);
            padding: 4px 8px;
            border-radius: 3px;
            margin: 4px 0;
        }
        
        .editable-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--accent-green);
            color: white;
        }
        
        .readonly-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--text-secondary);
            color: var(--bg-primary);
        }
        
        .intent-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--bg-secondary);
            border-top: 1px solid var(--border-color);
            flex-shrink: 0;
        }
        
        .intent-name {
            font-weight: 500;
        }
        
        .intent-actions {
            display: flex;
            gap: 8px;
        }
        
        .empty-state {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: var(--text-secondary);
        }
        
        .empty-state h2 {
            margin-bottom: 8px;
        }
        
        .zoom-controls {
            position: absolute;
            bottom: 16px;
            right: 16px;
            display: flex;
            gap: 4px;
            z-index: 10;
        }
        
        .zoom-btn {
            width: 32px;
            height: 32px;
            border: 1px solid var(--border-color);
            background: var(--bg-secondary);
            color: var(--text-primary);
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .zoom-btn:hover {
            background: var(--bg-tertiary);
        }
        
        .zoom-level {
            font-size: 11px;
            color: var(--text-secondary);
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 0 8px;
            display: flex;
            align-items: center;
        }
        
        .edge-legend {
            position: absolute;
            bottom: 16px;
            left: 16px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 8px 12px;
            z-index: 10;
            font-size: 11px;
        }
        
        .edge-legend-title {
            color: var(--text-secondary);
            margin-bottom: 6px;
            font-weight: 500;
        }
        
        .edge-legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            margin: 3px 0;
        }
        
        .edge-legend-color {
            width: 20px;
            height: 3px;
            border-radius: 1px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <button class="btn btn-primary" onclick="newIntention()">+ New Intention</button>
        </div>
        
        <div class="main-content">
            <div class="canvas-container" id="canvasContainer">
                <div class="graph-wrapper" id="graphWrapper">
                    <svg id="edges-svg">
                        <defs>
                            <marker id="arrowhead-default" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="var(--edge-color)"/>
                            </marker>
                            <marker id="arrowhead-uses" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="var(--edge-uses)"/>
                            </marker>
                            <marker id="arrowhead-triggers" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="var(--edge-triggers)"/>
                            </marker>
                            <marker id="arrowhead-filters" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="var(--edge-filters)"/>
                            </marker>
                            <marker id="arrowhead-produces" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="var(--edge-produces)"/>
                            </marker>
                        </defs>
                    </svg>
                    <div id="graph">
                        ${nodes.length === 0 ? `
                            <div class="empty-state">
                                <h2>No nodes yet</h2>
                                <p>Create a .intent-graph/nodes directory with YAML files to get started.</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="zoom-controls">
                    <button class="zoom-btn" onclick="zoomOut()">−</button>
                    <span class="zoom-level" id="zoomLevel">100%</span>
                    <button class="zoom-btn" onclick="zoomIn()">+</button>
                </div>
                <div class="edge-legend">
                    <div class="edge-legend-title">Relations</div>
                    <div class="edge-legend-item">
                        <span class="edge-legend-color" style="background: var(--edge-uses)"></span>
                        <span>uses</span>
                    </div>
                    <div class="edge-legend-item">
                        <span class="edge-legend-color" style="background: var(--edge-triggers)"></span>
                        <span>triggers</span>
                    </div>
                    <div class="edge-legend-item">
                        <span class="edge-legend-color" style="background: var(--edge-filters)"></span>
                        <span>filters</span>
                    </div>
                    <div class="edge-legend-item">
                        <span class="edge-legend-color" style="background: var(--edge-produces)"></span>
                        <span>produces</span>
                    </div>
                </div>
            </div>
            
            <div class="details-panel" id="detailsPanel">
                <div class="details-header">
                    <h3>Node Details</h3>
                    <button class="close-btn" onclick="closeDetails()">×</button>
                </div>
                <div class="details-content" id="detailsContent">
                </div>
            </div>
        </div>
        
        ${selectedIntent ? `
            <div class="intent-bar">
                <span class="intent-name">Intent: ${selectedIntent.name}</span>
                <div class="intent-actions">
                    <button class="btn btn-success" onclick="implement()">Implement</button>
                    <button class="btn btn-danger" onclick="discard()">Discard</button>
                </div>
            </div>
        ` : ''}
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const nodes = ${nodesJson};
        const selectedIntent = ${intentJson};
        const deltaNodeIds = new Set(${deltaNodeIdsJson});
        
        // State
        let zoomLevel = 1;
        let selectedNodeId = null;
        let nodePositions = {};
        
        // Drag state
        let isDraggingNode = false;
        let draggedNode = null;
        let dragOffset = { x: 0, y: 0 };
        
        // Pan state
        let isPanning = false;
        let panStart = { x: 0, y: 0 };
        let scrollStart = { x: 0, y: 0 };
        
        const canvasContainer = document.getElementById('canvasContainer');
        const graphWrapper = document.getElementById('graphWrapper');
        const graph = document.getElementById('graph');
        
        // Initialize node positions in a grid layout
        function initializeNodePositions() {
            const cols = 4;
            const nodeWidth = 250;
            const nodeHeight = 200;
            const gapX = 80;
            const gapY = 60;
            const startX = 40;
            const startY = 40;
            
            nodes.forEach((node, index) => {
                const col = index % cols;
                const row = Math.floor(index / cols);
                nodePositions[node.id] = {
                    x: startX + col * (nodeWidth + gapX),
                    y: startY + row * (nodeHeight + gapY)
                };
            });
        }
        
        // Render all nodes
        function renderNodes() {
            graph.innerHTML = '';
            
            if (nodes.length === 0) {
                graph.innerHTML = \`
                    <div class="empty-state">
                        <h2>No nodes yet</h2>
                        <p>Create a .intent-graph/nodes directory with YAML files to get started.</p>
                    </div>
                \`;
                return;
            }
            
            nodes.forEach(node => {
                const pos = nodePositions[node.id];
                const isAdded = deltaNodeIds.has(node.id);
                const nodeEl = document.createElement('div');
                nodeEl.className = 'node' + (isAdded ? ' added' : '') + (selectedNodeId === node.id ? ' selected' : '');
                nodeEl.dataset.id = node.id;
                nodeEl.style.left = pos.x + 'px';
                nodeEl.style.top = pos.y + 'px';
                
                nodeEl.innerHTML = \`
                    <div class="node-type">\${node.type}</div>
                    <div class="node-name">\${node.name}</div>
                    <div class="node-description">\${node.description || ''}</div>
                    \${(node.inputs && node.inputs.length > 0) || (node.outputs && node.outputs.length > 0) ? \`
                        <div class="node-connections">
                            \${node.inputs?.map(i => \`<span class="connection-label connection-input">← \${i.nodeId}</span>\`).join('') || ''}
                            \${node.outputs?.map(o => \`<span class="connection-label connection-output">\${o.nodeId} →</span>\`).join('') || ''}
                        </div>
                    \` : ''}
                \`;
                
                // Node click/drag events
                nodeEl.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    startNodeDrag(e, nodeEl, node.id);
                });
                
                graph.appendChild(nodeEl);
            });
        }
        
        // Calculate closest border points between two rectangles
        function getClosestBorderPoints(source, target) {
            const sourceCenterX = source.x + source.width / 2;
            const sourceCenterY = source.y + source.height / 2;
            const targetCenterX = target.x + target.width / 2;
            const targetCenterY = target.y + target.height / 2;
            
            // Get intersection point with source border
            const sourcePoint = getLineBorderIntersection(
                sourceCenterX, sourceCenterY,
                targetCenterX, targetCenterY,
                source.x, source.y, source.width, source.height
            );
            
            // Get intersection point with target border
            const targetPoint = getLineBorderIntersection(
                targetCenterX, targetCenterY,
                sourceCenterX, sourceCenterY,
                target.x, target.y, target.width, target.height
            );
            
            return {
                startX: sourcePoint.x,
                startY: sourcePoint.y,
                endX: targetPoint.x,
                endY: targetPoint.y
            };
        }
        
        // Get intersection of a line from center to target with rectangle border
        function getLineBorderIntersection(cx, cy, tx, ty, rx, ry, rw, rh) {
            const dx = tx - cx;
            const dy = ty - cy;
            
            if (dx === 0 && dy === 0) {
                return { x: cx, y: cy };
            }
            
            // Check intersection with each edge
            let t = Infinity;
            let result = { x: cx, y: cy };
            
            // Right edge
            if (dx > 0) {
                const tRight = (rx + rw - cx) / dx;
                const yRight = cy + tRight * dy;
                if (yRight >= ry && yRight <= ry + rh && tRight < t) {
                    t = tRight;
                    result = { x: rx + rw, y: yRight };
                }
            }
            
            // Left edge
            if (dx < 0) {
                const tLeft = (rx - cx) / dx;
                const yLeft = cy + tLeft * dy;
                if (yLeft >= ry && yLeft <= ry + rh && tLeft < t) {
                    t = tLeft;
                    result = { x: rx, y: yLeft };
                }
            }
            
            // Bottom edge
            if (dy > 0) {
                const tBottom = (ry + rh - cy) / dy;
                const xBottom = cx + tBottom * dx;
                if (xBottom >= rx && xBottom <= rx + rw && tBottom < t) {
                    t = tBottom;
                    result = { x: xBottom, y: ry + rh };
                }
            }
            
            // Top edge
            if (dy < 0) {
                const tTop = (ry - cy) / dy;
                const xTop = cx + tTop * dx;
                if (xTop >= rx && xTop <= rx + rw && tTop < t) {
                    t = tTop;
                    result = { x: xTop, y: ry };
                }
            }
            
            return result;
        }
        
        // Draw all edges
        function drawEdges() {
            const svg = document.getElementById('edges-svg');
            const nodeElements = document.querySelectorAll('.node');
            const nodeRects = {};
            
            // Get node positions and dimensions
            nodeElements.forEach(el => {
                nodeRects[el.dataset.id] = {
                    x: parseFloat(el.style.left) || 0,
                    y: parseFloat(el.style.top) || 0,
                    width: el.offsetWidth,
                    height: el.offsetHeight
                };
            });
            
            // Clear existing edges
            svg.querySelectorAll('path').forEach(p => p.remove());
            
            // Get color and marker for relation type
            function getRelationStyle(relation) {
                const styles = {
                    uses: { color: 'var(--edge-uses)', marker: 'arrowhead-uses' },
                    triggers: { color: 'var(--edge-triggers)', marker: 'arrowhead-triggers' },
                    filters: { color: 'var(--edge-filters)', marker: 'arrowhead-filters' },
                    produces: { color: 'var(--edge-produces)', marker: 'arrowhead-produces' }
                };
                return styles[relation] || { color: 'var(--edge-color)', marker: 'arrowhead-default' };
            }
            
            // Draw edges for each connection
            nodes.forEach(node => {
                const sourceRect = nodeRects[node.id];
                if (!sourceRect) return;
                
                (node.outputs || []).forEach(output => {
                    const targetRect = nodeRects[output.nodeId];
                    if (!targetRect) return;
                    
                    // Calculate edge path with closest border points
                    const points = getClosestBorderPoints(sourceRect, targetRect);
                    
                    // Create curved bezier path
                    const dx = Math.abs(points.endX - points.startX);
                    const dy = Math.abs(points.endY - points.startY);
                    const controlOffset = Math.min(Math.max(dx, dy) * 0.4, 100);
                    
                    // Determine control point directions based on which edges connect
                    const midX = (points.startX + points.endX) / 2;
                    const midY = (points.startY + points.endY) / 2;
                    
                    const style = getRelationStyle(output.relation);
                    
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', \`M \${points.startX} \${points.startY} Q \${midX} \${points.startY}, \${midX} \${midY} T \${points.endX} \${points.endY}\`);
                    path.setAttribute('class', 'edge');
                    path.setAttribute('stroke', style.color);
                    path.setAttribute('marker-end', \`url(#\${style.marker})\`);
                    svg.appendChild(path);
                });
            });
            
            // Resize SVG to match content
            svg.setAttribute('width', graphWrapper.scrollWidth);
            svg.setAttribute('height', graphWrapper.scrollHeight);
        }
        
        // Node drag functions
        function startNodeDrag(e, nodeEl, nodeId) {
            isDraggingNode = true;
            draggedNode = nodeEl;
            selectedNodeId = nodeId;
            
            const rect = nodeEl.getBoundingClientRect();
            const wrapperRect = graphWrapper.getBoundingClientRect();
            
            dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            
            nodeEl.classList.add('dragging');
            updateNodeSelection();
            showNodeDetails(nodeId);
        }
        
        function onMouseMove(e) {
            if (isDraggingNode && draggedNode) {
                const wrapperRect = graphWrapper.getBoundingClientRect();
                const containerRect = canvasContainer.getBoundingClientRect();
                
                // Calculate new position relative to wrapper
                let newX = (e.clientX - containerRect.left + canvasContainer.scrollLeft) / zoomLevel - dragOffset.x;
                let newY = (e.clientY - containerRect.top + canvasContainer.scrollTop) / zoomLevel - dragOffset.y;
                
                // Clamp to positive values
                newX = Math.max(0, newX);
                newY = Math.max(0, newY);
                
                draggedNode.style.left = newX + 'px';
                draggedNode.style.top = newY + 'px';
                nodePositions[draggedNode.dataset.id] = { x: newX, y: newY };
                
                drawEdges();
            } else if (isPanning) {
                const dx = e.clientX - panStart.x;
                const dy = e.clientY - panStart.y;
                
                canvasContainer.scrollLeft = scrollStart.x - dx;
                canvasContainer.scrollTop = scrollStart.y - dy;
            }
        }
        
        function onMouseUp() {
            if (isDraggingNode && draggedNode) {
                draggedNode.classList.remove('dragging');
                isDraggingNode = false;
                draggedNode = null;
            }
            
            if (isPanning) {
                isPanning = false;
                canvasContainer.classList.remove('panning');
            }
        }
        
        // Background pan functions
        function startPan(e) {
            if (e.target === canvasContainer || e.target === graphWrapper || e.target === graph) {
                isPanning = true;
                panStart = { x: e.clientX, y: e.clientY };
                scrollStart = { x: canvasContainer.scrollLeft, y: canvasContainer.scrollTop };
                canvasContainer.classList.add('panning');
                
                // Deselect node when clicking background
                selectedNodeId = null;
                updateNodeSelection();
                closeDetails();
            }
        }
        
        // Update node selection styling
        function updateNodeSelection() {
            document.querySelectorAll('.node').forEach(el => {
                if (el.dataset.id === selectedNodeId) {
                    el.classList.add('selected');
                } else {
                    el.classList.remove('selected');
                }
            });
        }
        
        // Zoom functions
        function setZoom(level) {
            zoomLevel = Math.max(0.25, Math.min(3, level));
            graphWrapper.style.transform = \`scale(\${zoomLevel})\`;
            document.getElementById('zoomLevel').textContent = Math.round(zoomLevel * 100) + '%';
        }
        
        function zoomIn() {
            setZoom(zoomLevel + 0.1);
        }
        
        function zoomOut() {
            setZoom(zoomLevel - 0.1);
        }
        
        function onWheel(e) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            setZoom(zoomLevel + delta);
        }
        
        // Details panel functions
        function showNodeDetails(nodeId) {
            const node = nodes.find(n => n.id === nodeId);
            if (!node) return;
            
            const panel = document.getElementById('detailsPanel');
            const content = document.getElementById('detailsContent');
            const isEditable = selectedIntent !== null && deltaNodeIds.has(nodeId);
            
            content.innerHTML = \`
                <div class="field-group">
                    <div class="field-label">Status</div>
                    <span class="\${isEditable ? 'editable-badge' : 'readonly-badge'}">
                        \${isEditable ? 'Editable' : 'Read-only'}
                    </span>
                </div>
                
                <div class="field-group">
                    <div class="field-label">ID</div>
                    <div class="field-value">\${node.id}</div>
                </div>
                
                <div class="field-group">
                    <div class="field-label">Type</div>
                    <div class="field-value">\${node.type}</div>
                </div>
                
                <div class="field-group">
                    <div class="field-label">Name</div>
                    \${isEditable 
                        ? \`<input type="text" class="field-input" value="\${node.name}" onchange="updateNodeField('\${node.id}', 'name', this.value)">\`
                        : \`<div class="field-value">\${node.name}</div>\`
                    }
                </div>
                
                <div class="field-group">
                    <div class="field-label">Description</div>
                    \${isEditable
                        ? \`<textarea class="field-input" rows="3" onchange="updateNodeField('\${node.id}', 'description', this.value)">\${node.description || ''}</textarea>\`
                        : \`<div class="field-value">\${node.description || 'No description'}</div>\`
                    }
                </div>
                
                \${node.invariants && node.invariants.length > 0 ? \`
                    <div class="field-group">
                        <div class="field-label">Invariants</div>
                        <div class="field-list">
                            \${node.invariants.map(inv => \`<div class="field-list-item">\${inv}</div>\`).join('')}
                        </div>
                    </div>
                \` : ''}
                
                \${node.entryPoints && node.entryPoints.length > 0 ? \`
                    <div class="field-group">
                        <div class="field-label">Entry Points</div>
                        <div class="field-list">
                            \${node.entryPoints.map(ep => \`<div class="field-list-item">\${ep.type}: \${ep.name}</div>\`).join('')}
                        </div>
                    </div>
                \` : ''}
                
                \${node.inputs && node.inputs.length > 0 ? \`
                    <div class="field-group">
                        <div class="field-label">Inputs</div>
                        <div class="field-list">
                            \${node.inputs.map(inp => \`<div class="field-list-item">← \${inp.nodeId}\${inp.relation ? ' (' + inp.relation + ')' : ''}</div>\`).join('')}
                        </div>
                    </div>
                \` : ''}
                
                \${node.outputs && node.outputs.length > 0 ? \`
                    <div class="field-group">
                        <div class="field-label">Outputs</div>
                        <div class="field-list">
                            \${node.outputs.map(out => \`<div class="field-list-item">\${out.nodeId} →\${out.relation ? ' (' + out.relation + ')' : ''}</div>\`).join('')}
                        </div>
                    </div>
                \` : ''}
                
                \${Object.keys(node.metadata || {}).length > 0 ? \`
                    <div class="field-group">
                        <div class="field-label">Metadata</div>
                        <div class="field-list">
                            \${Object.entries(node.metadata).map(([k, v]) => \`<div class="field-list-item"><strong>\${k}:</strong> \${v}</div>\`).join('')}
                        </div>
                    </div>
                \` : ''}
            \`;
            
            panel.classList.add('visible');
        }
        
        function closeDetails() {
            document.getElementById('detailsPanel').classList.remove('visible');
        }
        
        function updateNodeField(nodeId, field, value) {
            vscode.postMessage({ 
                command: 'updateNode', 
                nodeId: nodeId, 
                field: field, 
                value: value 
            });
        }
        
        // VS Code message functions
        function newIntention() {
            vscode.postMessage({ command: 'newIntention' });
        }
        
        function implement() {
            if (selectedIntent) {
                vscode.postMessage({ command: 'implement', intentName: selectedIntent.name });
            }
        }
        
        function discard() {
            if (selectedIntent) {
                vscode.postMessage({ command: 'discard', intentName: selectedIntent.name });
            }
        }
        
        // Event listeners
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        canvasContainer.addEventListener('mousedown', startPan);
        canvasContainer.addEventListener('wheel', onWheel, { passive: false });
        
        // Initialize
        initializeNodePositions();
        renderNodes();
        setTimeout(drawEdges, 100);
        window.addEventListener('resize', drawEdges);
    </script>
</body>
</html>`;
    }
}
