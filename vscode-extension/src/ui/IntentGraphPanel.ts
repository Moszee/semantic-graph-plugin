import * as vscode from 'vscode';
import { GraphStore } from '../store/GraphStore';
import { Logger } from '../lib/Logger';
import { AgentLogger } from '../lib/AgentLogger';

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
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'resources'),
                    vscode.Uri.joinPath(extensionUri, 'out')
                ]
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
                    case 'tweakNode':
                        Logger.info('IntentGraphPanel', 'Node tweak requested from webview', {
                            nodeId: message.nodeId,
                            promptLength: message.prompt?.length || 0
                        });
                        // Handle AI-powered node tweaking
                        this._handleNodeTweak(message.nodeId, message.prompt);
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

        // Subscribe to agent logs and forward to webview
        const agentLogger = AgentLogger.getInstance();
        agentLogger.onLogAdded(() => {
            this._sendLogsToWebview();
        }, null, this._disposables);
    }

    /**
     * Send current logs to the webview.
     */
    private _sendLogsToWebview(): void {
        const agentLogger = AgentLogger.getInstance();
        const logs = agentLogger.getRecentLogs().map(log => ({
            timestamp: log.timestamp,
            type: log.type,
            message: log.message
        }));
        this._panel.webview.postMessage({ command: 'updateLogs', logs });
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

    private async _handleNodeTweak(nodeId: string, prompt: string) {
        Logger.info('IntentGraphPanel', 'Processing AI node tweak request', { nodeId, prompt });

        const selectedIntent = this._store.getSelectedIntent();
        if (!selectedIntent) {
            Logger.warn('IntentGraphPanel', 'Node tweak attempted with no intent selected', { nodeId });
            vscode.window.showWarningMessage('Please select an intent before tweaking a node.');
            return;
        }

        try {
            // Import PlanningAgent dynamically to avoid circular dependencies
            const { PlanningAgent } = await import('../agent/PlanningAgent.js');
            const agent = new PlanningAgent(this._store);

            // Show progress to user
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'AI is tweaking the node...',
                cancellable: false
            }, async () => {
                const delta = await agent.tweakNode(nodeId, prompt);

                if (delta && delta.operations && delta.operations.length > 0) {
                    Logger.info('IntentGraphPanel', 'AI successfully generated delta for node tweak', {
                        deltaName: delta.name,
                        operationCount: delta.operations.length
                    });

                    // Merge AI's delta operations into the existing selected intent
                    for (const newOp of delta.operations) {
                        // Find existing operation for the same node
                        const existingOpIndex = selectedIntent.operations.findIndex(
                            op => op.node.id === newOp.node.id
                        );

                        if (existingOpIndex !== -1) {
                            // Update existing operation with new node data
                            Logger.debug('IntentGraphPanel', 'Merging operation into existing', {
                                nodeId: newOp.node.id,
                                operation: newOp.operation
                            });
                            selectedIntent.operations[existingOpIndex] = newOp;
                        } else {
                            // Add new operation to the intent
                            Logger.debug('IntentGraphPanel', 'Adding new operation to intent', {
                                nodeId: newOp.node.id,
                                operation: newOp.operation
                            });
                            selectedIntent.operations.push(newOp);
                        }
                    }

                    // Save the updated intent
                    this._store.saveIntent(selectedIntent);

                    // Refresh the view
                    this._update();

                    vscode.window.showInformationMessage(`Node tweaked successfully in: ${selectedIntent.name}`);
                } else {
                    Logger.warn('IntentGraphPanel', 'AI failed to generate delta for node tweak');
                    vscode.window.showWarningMessage('AI could not process the tweak request. Please try again.');
                }
            });
        } catch (error) {
            Logger.error('IntentGraphPanel', 'Error handling node tweak', error);
            vscode.window.showErrorMessage(`Failed to tweak node: ${error}`);
        }
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
            questions: node.questions || [],
            entryPoints: node.entryPoints || [],
            inputs: node.inputs || [],
            outputs: node.outputs || [],
            metadata: node.metadata || {}
        })));

        const intentJson = selectedIntent ? JSON.stringify(selectedIntent) : 'null';
        const deltaNodeIdsJson = JSON.stringify(Array.from(deltaNodeIds));

        // Get current logs from AgentLogger so they persist across view refreshes
        const agentLogger = AgentLogger.getInstance();
        const logsJson = JSON.stringify(agentLogger.getRecentLogs().map(log => ({
            timestamp: log.timestamp,
            type: log.type,
            message: log.message
        })));

        // Get URI for CSS and Preact bundle
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'intent-graph.css')
        );

        const scripts = [
            'vscode-api.js',
            'graph-state.js',
            'graph-layout.js',
            'graph-renderer.js',
            'graph-edges.js',
            'graph-interaction.js',
            'main.js'
        ];

        const scriptTags = scripts.map(name => {
            const uri = webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'resources', 'scripts', name)
            );
            return `<script src="${uri}"></script>`;
        }).join('\n    ');

        const webviewScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview.js')
        );

        // Return simple HTML that loads Preact bundle
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
    <title>Intent Graph</title>
    <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <div id="root"></div>
    
    <script>
        // Inject data as global variable for Preact app
        window.GRAPH_DATA = {
            nodes: ${nodesJson},
            selectedIntent: ${intentJson},
            deltaNodeIds: new Set(${deltaNodeIdsJson}),
            logs: ${logsJson}
        };
    </script>
    <script src="${webviewScriptUri}"></script>
    ${scriptTags}
</body>
</html>`;
    }
}
