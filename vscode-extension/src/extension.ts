import * as vscode from 'vscode';
import { IntentGraphPanel } from './ui/IntentGraphPanel';
import { IntentsTreeDataProvider } from './ui/IntentsTreeDataProvider';
import { GraphStore } from './store/GraphStore';
import { PlanningAgent, generateImplementationInstructions } from './agent/PlanningAgent';
import { Logger } from './lib/Logger';

export function activate(context: vscode.ExtensionContext) {
    // Initialize logger first
    Logger.initialize(context);
    Logger.info('Extension', 'Intent Graph extension is now active');

    const graphStore = new GraphStore();
    const planningAgent = new PlanningAgent(graphStore);

    // Register Tree View
    const intentsProvider = new IntentsTreeDataProvider(graphStore);
    vscode.window.registerTreeDataProvider('intentGraph.intents', intentsProvider);

    // Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('intentGraph.openVisualization', () => {
            Logger.info('Extension', 'Opening Intent Graph visualization');
            IntentGraphPanel.createOrShow(context.extensionUri, graphStore);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentGraph.newIntention', async () => {
            const prompt = await vscode.window.showInputBox({
                prompt: 'Describe the new feature or change you want to implement',
                placeHolder: 'e.g., Add user deletion capability'
            });

            if (prompt) {
                Logger.info('Extension', 'User initiated new intention', { prompt });
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Creating intention...',
                    cancellable: false
                }, async () => {
                    const intent = await planningAgent.generateIntention(prompt);
                    if (intent) {
                        graphStore.saveIntent(intent);
                        graphStore.selectIntent(intent);
                        Logger.info('Extension', 'Intent created and selected successfully', { intentName: intent.name });
                        vscode.window.showInformationMessage(`Intent "${intent.name}" created successfully.`);
                    } else {
                        Logger.error('Extension', 'Failed to generate intention');
                        vscode.window.showErrorMessage('Failed to generate intention. Check your API key and try again.');
                    }
                });
            } else {
                Logger.debug('Extension', 'New intention cancelled by user');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentGraph.selectIntent', (intent) => {
            Logger.info('Extension', 'User selected intent', { intentName: intent?.name });
            graphStore.selectIntent(intent);
            // Auto-open the visualization panel when selecting an intent
            IntentGraphPanel.createOrShow(context.extensionUri, graphStore);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentGraph.implement', async (intentName: string) => {
            const selectedIntent = graphStore.getSelectedIntent();
            if (!selectedIntent) {
                Logger.warn('Extension', 'Implement command called with no intent selected');
                vscode.window.showWarningMessage('No intent selected.');
                return;
            }

            Logger.info('Extension', 'Generating implementation instructions', { intentName: selectedIntent.name });
            // Generate instructions for Antigravity Agent
            const instructions = generateImplementationInstructions(
                selectedIntent,
                graphStore.getNodes()
            );

            // Copy implementation instructions to clipboard for the agent
            await vscode.env.clipboard.writeText(instructions);
            Logger.info('Extension', 'Instructions copied to clipboard', {
                instructionsLength: instructions.length
            });

            const action = await vscode.window.showInformationMessage(
                `Implementation instructions copied to clipboard. Paste into the Agent chat (Ctrl+V) and press Enter.`,
                'Merge Intent Now',
                'Open Chat'
            );

            if (action === 'Merge Intent Now') {
                Logger.info('Extension', 'Merging intent into graph', { intentName: selectedIntent.name });
                graphStore.deleteIntent(selectedIntent.name);
                graphStore.selectIntent(null);
                vscode.window.showInformationMessage(`Intent "${selectedIntent.name}" merged into graph.`);
            } else if (action === 'Open Chat') {
                // Try to open chat panel (may vary by IDE)
                try {
                    await vscode.commands.executeCommand('workbench.action.chat.open');
                } catch {
                    // Ignore if command not available
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentGraph.discard', async (intentName: string) => {
            const selectedIntent = graphStore.getSelectedIntent();
            if (!selectedIntent) {
                Logger.warn('Extension', 'Discard command called with no intent selected');
                vscode.window.showWarningMessage('No intent selected.');
                return;
            }

            Logger.info('Extension', 'User requested to discard intent', { intentName: selectedIntent.name });
            const confirm = await vscode.window.showWarningMessage(
                `Discard intent "${selectedIntent.name}"?`,
                { modal: true },
                'Discard'
            );

            if (confirm === 'Discard') {
                Logger.info('Extension', 'Discarding intent', { intentName: selectedIntent.name });
                graphStore.deleteIntent(selectedIntent.name);
                graphStore.selectIntent(null);
                vscode.window.showInformationMessage(`Intent "${selectedIntent.name}" discarded.`);
            } else {
                Logger.debug('Extension', 'Intent discard cancelled by user');
            }
        })
    );

    // Watch for file changes in .intent-graph directory
    const watcher = vscode.workspace.createFileSystemWatcher('**/.intent-graph/**/*.yaml');
    watcher.onDidChange((uri) => {
        Logger.debug('Extension', 'File changed in .intent-graph', { path: uri.fsPath });
        graphStore.refresh();
    });
    watcher.onDidCreate((uri) => {
        Logger.debug('Extension', 'File created in .intent-graph', { path: uri.fsPath });
        graphStore.refresh();
    });
    watcher.onDidDelete((uri) => {
        Logger.debug('Extension', 'File deleted in .intent-graph', { path: uri.fsPath });
        graphStore.refresh();
    });
    context.subscriptions.push(watcher);
}

export function deactivate() { }
