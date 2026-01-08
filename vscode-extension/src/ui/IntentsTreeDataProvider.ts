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
        this.description = intent.description || '';
        this.tooltip = `${intent.name}: ${intent.operations?.length || 0} operations`;
        this.contextValue = 'intent';

        this.command = {
            command: 'intentGraph.selectIntent',
            title: 'Select Intent',
            arguments: [intent]
        };
    }
}
