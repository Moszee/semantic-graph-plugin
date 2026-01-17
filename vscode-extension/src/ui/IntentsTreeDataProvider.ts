import * as vscode from 'vscode';
import { GraphStore } from '../store/GraphStore';
import { GraphDelta } from '../lib/types';
import { Logger } from '../lib/Logger';

/**
 * Tree data provider for the Intents sidebar view.
 */
export class IntentsTreeDataProvider implements vscode.TreeDataProvider<IntentTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<IntentTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private store: GraphStore) {
        store.onDidChange(() => this.refresh());
    }

    refresh(): void {
        Logger.debug('IntentsTreeDataProvider', 'Refreshing tree view');
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: IntentTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: IntentTreeItem): Thenable<IntentTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        const intents = this.store.getIntents();
        const items = intents.map(intent => new IntentTreeItem(intent, this.store));
        Logger.debug('IntentsTreeDataProvider', 'Loaded intent tree items', { count: items.length });
        return Promise.resolve(items);
    }
}

class IntentTreeItem extends vscode.TreeItem {
    constructor(
        public readonly intent: GraphDelta,
        private store: GraphStore
    ) {
        super(intent.name, vscode.TreeItemCollapsibleState.None);

        // Check if any node in the intent has open questions
        const questionsCount = intent.operations?.reduce((count, op) => {
            return count + (op.node.questions?.length || 0);
        }, 0) || 0;

        const hasQuestions = questionsCount > 0;

        // Add visual indicator for intents with questions
        if (hasQuestions) {
            this.label = `🔴 ${intent.name}`;
            this.description = `${questionsCount} question(s) - ${intent.description || ''}`;
        } else {
            this.description = intent.description || '';
        }

        this.tooltip = `${intent.name}: ${intent.operations?.length || 0} operations` +
            (hasQuestions ? `\n⚠️ ${questionsCount} open question(s)` : '');
        this.contextValue = 'intent';

        this.command = {
            command: 'intentGraph.selectIntent',
            title: 'Select Intent',
            arguments: [intent]
        };
    }
}

