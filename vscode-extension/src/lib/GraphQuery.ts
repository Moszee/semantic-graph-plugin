import { IntentNode, IntentGraph, GraphDelta, DeltaOperation } from './types';
import { Logger } from './Logger';

/**
 * Query functions for the Intent Graph.
 */
export class GraphQuery {
    private graph: IntentGraph;

    constructor(nodes: Map<string, IntentNode>) {
        this.graph = { nodes };
    }

    /**
     * Get a node by its ID.
     */
    getNode(id: string): IntentNode | undefined {
        const node = this.graph.nodes.get(id);
        Logger.debug('GraphQuery', 'getNode called', { id, found: !!node });
        return node;
    }

    /**
     * Get all nodes.
     */
    getAllNodes(): IntentNode[] {
        return Array.from(this.graph.nodes.values());
    }

    /**
     * Get a subgraph starting from an entry point (BFS traversal).
     */
    getSubgraph(entryPointId: string): IntentNode[] {
        Logger.debug('GraphQuery', 'getSubgraph called', { entryPointId });
        const result: IntentNode[] = [];
        const visited = new Set<string>();
        const queue: string[] = [entryPointId];

        while (queue.length > 0) {
            const nodeId = queue.shift()!;
            if (visited.has(nodeId)) continue;
            visited.add(nodeId);

            const node = this.graph.nodes.get(nodeId);
            if (!node) continue;

            result.push(node);

            // Add connected nodes (outputs)
            if (node.outputs) {
                for (const ref of node.outputs) {
                    if (!visited.has(ref.nodeId)) {
                        queue.push(ref.nodeId);
                    }
                }
            }
        }

        Logger.debug('GraphQuery', 'getSubgraph result', { entryPointId, nodeCount: result.length });
        return result;
    }

    /**
     * Find nodes by entry point type and optional name pattern.
     * @param type Optional entry point type to filter by (endpoint, job, queue)
     * @param namePattern Optional substring to match against entry point names
     */
    findNodesByEntryPoint(type?: string, namePattern?: string): IntentNode[] {
        Logger.debug('GraphQuery', 'findNodesByEntryPoint called', { type, namePattern });
        const result = this.getAllNodes().filter(node => {
            if (!node.entryPoints || node.entryPoints.length === 0) return false;

            return node.entryPoints.some(ep => {
                const typeMatches = !type || ep.type === type;
                const nameMatches = !namePattern || ep.name.toLowerCase().includes(namePattern.toLowerCase());
                return typeMatches && nameMatches;
            });
        });
        Logger.debug('GraphQuery', 'findNodesByEntryPoint result', { type, namePattern, count: result.length });
        return result;
    }

    /**
     * Find nodes by entry point filters (legacy support).
     * Now matches against entry point names containing any of the filter terms.
     */
    findNodes(filters: string[][]): IntentNode[] {
        Logger.debug('GraphQuery', 'findNodes called', { filters });
        const result = this.getAllNodes().filter(node => {
            if (!node.entryPoints || node.entryPoints.length === 0) return false;

            // Check if any filter group matches
            return filters.some(filterGroup => {
                // All terms in the filter group must appear in at least one entry point name
                return node.entryPoints!.some(ep => {
                    const epName = ep.name.toLowerCase();
                    return filterGroup.every(term => epName.includes(term.toLowerCase()));
                });
            });
        });
        Logger.debug('GraphQuery', 'findNodes result', { filterCount: filters.length, resultCount: result.length });
        return result;
    }

    /**
     * Apply a delta to the graph (in-memory only).
     * Returns a new graph with the delta applied.
     */
    applyDelta(delta: GraphDelta): IntentGraph {
        Logger.debug('GraphQuery', 'applyDelta called', {
            deltaName: delta.name,
            operationCount: delta.operations.length
        });
        const newNodes = new Map(this.graph.nodes);

        for (const op of delta.operations) {
            switch (op.operation) {
                case 'add':
                case 'update':
                    newNodes.set(op.node.id, op.node);
                    Logger.debug('GraphQuery', `Delta operation: ${op.operation}`, { nodeId: op.node.id });
                    break;
                case 'remove':
                    newNodes.delete(op.node.id);
                    Logger.debug('GraphQuery', `Delta operation: remove`, { nodeId: op.node.id });
                    break;
            }
        }

        Logger.info('GraphQuery', 'Delta applied', {
            deltaName: delta.name,
            originalNodeCount: this.graph.nodes.size,
            newNodeCount: newNodes.size
        });
        return { nodes: newNodes };
    }
}
