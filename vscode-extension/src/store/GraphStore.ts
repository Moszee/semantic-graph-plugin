import * as vscode from 'vscode';
import { IntentNode, GraphDelta } from '../lib/types';
import { YamlLoader } from '../lib/YamlLoader';
import { GraphQuery } from '../lib/GraphQuery';
import { Logger } from '../lib/Logger';

/**
 * Central store for graph state.
 */
export class GraphStore {
    private nodes: Map<string, IntentNode> = new Map();
    private intents: GraphDelta[] = [];
    private query: GraphQuery;
    private selectedIntent: GraphDelta | null = null;

    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;

    constructor() {
        this.query = new GraphQuery(this.nodes);
        this.refresh();
    }

    /**
     * Refresh the store from disk.
     */
    refresh(): void {
        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot) {
            Logger.warn('GraphStore', 'No workspace root found, skipping refresh');
            return;
        }

        Logger.debug('GraphStore', 'Refreshing store', { workspaceRoot });
        this.nodes = YamlLoader.loadNodes(workspaceRoot);
        this.intents = YamlLoader.loadIntents(workspaceRoot);
        this.query = new GraphQuery(this.nodes);
        Logger.info('GraphStore', 'Store refreshed', {
            nodeCount: this.nodes.size,
            intentCount: this.intents.length
        });
        this._onDidChange.fire();
    }

    /**
     * Get the workspace root path.
     */
    private getWorkspaceRoot(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
    }

    /**
     * Get all nodes.
     */
    getNodes(): IntentNode[] {
        return Array.from(this.nodes.values());
    }

    /**
     * Get all intents.
     */
    getIntents(): GraphDelta[] {
        return this.intents;
    }

    /**
     * Get the selected intent.
     */
    getSelectedIntent(): GraphDelta | null {
        return this.selectedIntent;
    }

    /**
     * Set the selected intent.
     */
    selectIntent(intent: GraphDelta | null): void {
        Logger.info('GraphStore', 'Intent selected', { intentName: intent?.name || null });
        this.selectedIntent = intent;
        this._onDidChange.fire();
    }

    /**
     * Get merged nodes (current graph + intent delta).
     * @param intent Optional intent to apply (object or name). If undefined, returns base nodes.
     */
    getMergedNodes(intent?: GraphDelta | string): IntentNode[] {
        let delta: GraphDelta | undefined;

        if (typeof intent === 'string') {
            delta = this.intents.find(i => i.name === intent);
            if (!delta) {
                Logger.warn('GraphStore', 'Intent not found for merging', { intentName: intent });
            }
        } else {
            delta = intent;
        }

        if (!delta) {
            // Fallback to selected intent if no explicit intent provided? 
            // User said: "getMergedNodes should get selected intent name as a parameter... Store should be just a store... logic should be kept higher."
            // So if no intent passed, we return BASE nodes (or whatever 'this.query.applyDelta(undefined)' does? No, query applies delta).
            // Let's assume undefined intent -> Base nodes.
            return this.getNodes();
        }

        const mergedGraph = this.query.applyDelta(delta);
        return Array.from(mergedGraph.nodes.values());
    }

    /**
     * Get node by ID.
     * Searches base nodes first, then checks the selected delta for new/updated nodes.
     */
    getNode(id: string): IntentNode | undefined {
        // First check base nodes
        const baseNode = this.query.getNode(id);
        if (baseNode) {
            return baseNode;
        }

        // If not found in base nodes, check the selected delta
        if (this.selectedIntent) {
            for (const op of this.selectedIntent.operations) {
                if (op.node.id === id) {
                    return op.node;
                }
            }
        }

        return undefined;
    }

    /**
     * Get subgraph by entry point.
     */
    getSubgraph(entryPointId: string): IntentNode[] {
        return this.query.getSubgraph(entryPointId);
    }

    /**
     * Find nodes by filters.
     */
    findNodes(filters: string[][]): IntentNode[] {
        return this.query.findNodes(filters);
    }

    /**
     * Save a new intent.
     */
    saveIntent(intent: GraphDelta): void {
        Logger.info('GraphStore', 'Saving intent', { intentName: intent.name });
        const workspaceRoot = this.getWorkspaceRoot();
        if (workspaceRoot) {
            YamlLoader.saveIntent(workspaceRoot, intent);
            Logger.debug('GraphStore', 'Intent saved successfully', { intentName: intent.name });
            this.refresh();
        } else {
            Logger.error('GraphStore', 'Cannot save intent: no workspace root');
        }
    }

    /**
     * Delete an intent.
     */
    deleteIntent(intentName: string): void {
        Logger.info('GraphStore', 'Deleting intent', { intentName });
        const workspaceRoot = this.getWorkspaceRoot();
        if (workspaceRoot) {
            YamlLoader.deleteIntent(workspaceRoot, intentName);
            Logger.debug('GraphStore', 'Intent deleted successfully', { intentName });
            this.refresh();
        } else {
            Logger.error('GraphStore', 'Cannot delete intent: no workspace root');
        }
    }
}
