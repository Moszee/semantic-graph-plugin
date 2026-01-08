import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { IntentNode, GraphDelta } from './types';
import { Logger } from './Logger';

/**
 * Utility functions for loading and persisting YAML files.
 */
export class YamlLoader {
    /**
     * Load all nodes from the .intent-graph/nodes directory.
     */
    static loadNodes(workspaceRoot: string): Map<string, IntentNode> {
        const nodes = new Map<string, IntentNode>();
        const nodesDir = path.join(workspaceRoot, '.intent-graph', 'nodes');

        if (!fs.existsSync(nodesDir)) {
            Logger.debug('YamlLoader', 'Nodes directory does not exist', { nodesDir });
            return nodes;
        }

        Logger.debug('YamlLoader', 'Loading nodes from directory', { nodesDir });

        const walkDir = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walkDir(fullPath);
                } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const node = yaml.load(content) as IntentNode;
                        if (node && node.id) {
                            nodes.set(node.id, node);
                            Logger.debug('YamlLoader', 'Loaded node', { nodeId: node.id, file: entry.name });
                        }
                    } catch (e) {
                        Logger.error('YamlLoader', `Error loading node file: ${fullPath}`, e);
                    }
                }
            }
        };

        walkDir(nodesDir);
        Logger.info('YamlLoader', 'Finished loading nodes', { count: nodes.size });
        return nodes;
    }

    /**
     * Load all intents (deltas) from the .intent-graph/intents directory.
     */
    static loadIntents(workspaceRoot: string): GraphDelta[] {
        const intents: GraphDelta[] = [];
        const intentsDir = path.join(workspaceRoot, '.intent-graph', 'intents');

        if (!fs.existsSync(intentsDir)) {
            Logger.debug('YamlLoader', 'Intents directory does not exist', { intentsDir });
            return intents;
        }

        Logger.debug('YamlLoader', 'Loading intents from directory', { intentsDir });

        const entries = fs.readdirSync(intentsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
                const fullPath = path.join(intentsDir, entry.name);
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const intent = yaml.load(content) as GraphDelta;
                    if (intent) {
                        intent.name = intent.name || entry.name.replace(/\.(yaml|yml)$/, '');
                        intents.push(intent);
                        Logger.debug('YamlLoader', 'Loaded intent', { intentName: intent.name, file: entry.name });
                    }
                } catch (e) {
                    Logger.error('YamlLoader', `Error loading intent file: ${fullPath}`, e);
                }
            }
        }

        Logger.info('YamlLoader', 'Finished loading intents', { count: intents.length });
        return intents;
    }

    /**
     * Save an intent to the .intent-graph/intents directory.
     */
    static saveIntent(workspaceRoot: string, intent: GraphDelta): void {
        const intentsDir = path.join(workspaceRoot, '.intent-graph', 'intents');

        if (!fs.existsSync(intentsDir)) {
            Logger.debug('YamlLoader', 'Creating intents directory', { intentsDir });
            fs.mkdirSync(intentsDir, { recursive: true });
        }

        const fileName = `${intent.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.yaml`;
        const filePath = path.join(intentsDir, fileName);
        const content = yaml.dump(intent);
        fs.writeFileSync(filePath, content, 'utf8');
        Logger.info('YamlLoader', 'Intent saved to file', { filePath, intentName: intent.name });
    }

    /**
     * Delete an intent file.
     */
    static deleteIntent(workspaceRoot: string, intentName: string): void {
        const intentsDir = path.join(workspaceRoot, '.intent-graph', 'intents');
        const fileName = `${intentName.replace(/[^a-zA-Z0-9_-]/g, '_')}.yaml`;
        const filePath = path.join(intentsDir, fileName);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            Logger.info('YamlLoader', 'Intent file deleted', { filePath, intentName });
        } else {
            Logger.warn('YamlLoader', 'Intent file not found for deletion', { filePath, intentName });
        }
    }
}
