import OpenAI from 'openai';
import * as vscode from 'vscode';
import { GraphStore } from '../store/GraphStore';
import { IntentNode, GraphDelta } from '../lib/types';
import { Logger } from '../lib/Logger';
import { AgentLogger } from '../lib/AgentLogger';

/**
 * Tool Definitions
 */
const TOOL_GET_NODE: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'get_node',
        description: 'Get a node by its ID',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'The node ID' }
            },
            required: ['id']
        }
    }
};

const TOOL_GET_SUBGRAPH: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'get_subgraph',
        description: 'Get a subgraph starting from an entry point',
        parameters: {
            type: 'object',
            properties: {
                entryPointId: { type: 'string', description: 'The entry point node ID' }
            },
            required: ['entryPointId']
        }
    }
};

const TOOL_FIND_NODES: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'find_nodes',
        description: 'Find nodes by entry point filters. Filters are OR\'d groups of AND\'d tags.',
        parameters: {
            type: 'object',
            properties: {
                filters: {
                    type: 'array',
                    items: {
                        type: 'array',
                        items: { type: 'string' }
                    },
                    description: 'Array of filter groups, e.g., [["users", "delete"], ["users", "create"]]'
                }
            },
            required: ['filters']
        }
    }
};

const TOOL_EXECUTE_CODE: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'execute_code',
        description: 'Execute JavaScript code and return the result. Available in context: store (graph store), vscode (VS Code API), fs (sandboxed to workspace only), path (Node.js path module), workspaceFolders (array of workspace folder paths), console.',
        parameters: {
            type: 'object',
            properties: {
                code: {
                    type: 'string',
                    description: 'JavaScript code to execute. Must return a value.'
                }
            },
            required: ['code']
        }
    }
};

const TOOL_SPAWN_AGENT: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'spawn_agent',
        description: 'Spawn a sub-agent to perform a delegated task. Maximum 5 sub-agents allowed.',
        parameters: {
            type: 'object',
            properties: {
                task: {
                    type: 'string',
                    description: 'The task prompt for the sub-agent'
                },
                context: {
                    type: 'string',
                    description: 'Additional context to provide to the sub-agent'
                }
            },
            required: ['task']
        }
    }
};

/**
 * Shared tools logic for AI agents.
 * Centralizes tool definitions and execution dispatch.
 */
export class AiAgentTools {
    private store?: GraphStore;
    private spawner?: (task: string, context?: string) => Promise<unknown>;

    constructor(
        store?: GraphStore,
        spawner?: (task: string, context?: string) => Promise<unknown>
    ) {
        this.store = store;
        this.spawner = spawner;
    }

    /**
     * Get tools available for the Planning Agent.
     */
    getPlanningTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
        return [
            TOOL_GET_NODE,
            TOOL_GET_SUBGRAPH,
            TOOL_FIND_NODES,
            TOOL_EXECUTE_CODE,
            TOOL_SPAWN_AGENT
        ];
    }

    /**
     * Get tools available for the Implementation Agent.
     */
    getImplementationTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
        return [
            TOOL_EXECUTE_CODE
        ];
    }

    /**
     * Execute a tool call based on name and arguments.
     */
    /**
     * Execute a tool call based on name and arguments.
     * @param name Tool name
     * @param args Tool arguments
     * @param intent Optional intent to apply context (merged graph). If undefined, uses base graph.
     */
    async executeTool(name: string, args: Record<string, unknown>, intent?: GraphDelta | string): Promise<unknown> {
        let mergedNodes: IntentNode[] | undefined;
        let nodeMap: Map<string, IntentNode> | undefined;

        // Helper to get nodes lazily
        const getNodes = () => {
            if (!mergedNodes && this.store) {
                mergedNodes = this.store.getMergedNodes(intent);
                nodeMap = new Map(mergedNodes.map(n => [n.id, n]));
            }
            return { list: mergedNodes || [], map: nodeMap || new Map() };
        };

        switch (name) {
            case 'get_node':
                if (!this.store) return { error: 'GraphStore not available' };
                // If intent is present, we use the merged map
                if (intent) {
                    const { map } = getNodes();
                    return map.get(args.id as string) ?? null;
                }
                return this.store.getNode(args.id as string);

            case 'get_subgraph': {
                if (!this.store) return { error: 'GraphStore not available' };

                if (intent) {
                    // Custom traversal on merged nodes
                    const { map } = getNodes();
                    const result: IntentNode[] = [];
                    const visited = new Set<string>();
                    const queue: string[] = [args.entryPointId as string];

                    while (queue.length > 0) {
                        const nodeId = queue.shift()!;
                        if (visited.has(nodeId)) continue;
                        visited.add(nodeId);

                        const node = map.get(nodeId);
                        if (!node) continue;

                        result.push(node);

                        if (node.outputs) {
                            for (const outputId of node.outputs) {
                                if (!visited.has(outputId)) {
                                    queue.push(outputId);
                                }
                            }
                        }
                    }
                    return result;
                }

                return this.store.getSubgraph(args.entryPointId as string);
            }

            case 'find_nodes': {
                if (!this.store) return { error: 'GraphStore not available' };

                if (intent) {
                    const { list } = getNodes();
                    const filters = args.filters as string[][];
                    return list.filter(node => {
                        if (!node.entryPoints || node.entryPoints.length === 0) return false;
                        return filters.some(filterGroup => {
                            return node.entryPoints!.some(ep => {
                                const epName = ep.name.toLowerCase();
                                return filterGroup.every(term => epName.toLowerCase().includes(term.toLowerCase()));
                            });
                        });
                    });
                }

                return this.store.findNodes(args.filters as string[][]);
            }

            case 'execute_code':
                return this.executeCode(args.code as string);

            case 'spawn_agent':
                if (!this.spawner) return { error: 'Spawner not available' };
                return this.spawner(args.task as string, args.context as string | undefined);

            default:
                Logger.warn('AiAgentTools', `Unknown tool called: ${name}`, { args });
                return { error: `Unknown tool: ${name}` };
        }
    }

    /**
     * Execute JavaScript code in a sandboxed context.
     * Only allows read access to workspace files.
     */
    executeCode(code: string): unknown {
        Logger.debug('AiAgentTools', 'Executing code', { codeLength: code.length });
        try {
            const vm = require('vm');
            const fs = require('fs');
            const path = require('path');

            const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];

            const isPathAllowed = (targetPath: string): boolean => {
                const resolved = path.resolve(targetPath);
                return workspaceFolders.some(folder =>
                    resolved.startsWith(folder + path.sep) || resolved === folder
                );
            };

            const sandboxedFs = {
                readFileSync: (filePath: string, options?: any) => {
                    if (!isPathAllowed(filePath)) {
                        throw new Error(`Access denied: ${filePath} is outside workspace`);
                    }
                    return fs.readFileSync(filePath, options);
                },
                readFile: (filePath: string, options: any, callback?: any) => {
                    if (!isPathAllowed(filePath)) {
                        const err = new Error(`Access denied: ${filePath} is outside workspace`);
                        if (callback) { callback(err); }
                        else if (typeof options === 'function') { options(err); }
                        return;
                    }
                    return fs.readFile(filePath, options, callback);
                },
                readdirSync: (dirPath: string, options?: any) => {
                    if (!isPathAllowed(dirPath)) {
                        throw new Error(`Access denied: ${dirPath} is outside workspace`);
                    }
                    return fs.readdirSync(dirPath, options);
                },
                statSync: (filePath: string, options?: any) => {
                    if (!isPathAllowed(filePath)) {
                        throw new Error(`Access denied: ${filePath} is outside workspace`);
                    }
                    return fs.statSync(filePath, options);
                },
                existsSync: (filePath: string) => {
                    if (!isPathAllowed(filePath)) {
                        return false;
                    }
                    return fs.existsSync(filePath);
                }
            };

            const context = {
                fs: sandboxedFs,
                path,
                workspaceFolders,
                console: console,
                result: undefined as unknown
            };
            vm.createContext(context);

            const wrappedCode = `result = (() => { ${code} })()`;
            vm.runInContext(wrappedCode, context, { timeout: 5000 });

            Logger.debug('AiAgentTools', 'Code execution result', { result: context.result });
            AgentLogger.getInstance().logCodeExecution(code, context.result);
            return context.result;
        } catch (error: any) {
            Logger.error('AiAgentTools', 'Code execution failed', error);
            return { error: error.message };
        }
    }

    /**
     * Execute JavaScript code asynchronously in a sandboxed context.
     * Supports async/await patterns in the executed code.
     */
    async executeCodeAsync(code: string): Promise<unknown> {
        Logger.debug('AiAgentTools', 'Executing async code', { codeLength: code.length });
        try {
            const vm = require('vm');
            const fs = require('fs');
            const path = require('path');

            const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];

            const isPathAllowed = (targetPath: string): boolean => {
                const resolved = path.resolve(targetPath);
                return workspaceFolders.some(folder =>
                    resolved.startsWith(folder + path.sep) || resolved === folder
                );
            };

            const sandboxedFs = {
                readFileSync: (filePath: string, options?: any) => {
                    if (!isPathAllowed(filePath)) {
                        throw new Error(`Access denied: ${filePath} is outside workspace`);
                    }
                    return fs.readFileSync(filePath, options);
                },
                readFile: (filePath: string, options: any, callback?: any) => {
                    if (!isPathAllowed(filePath)) {
                        const err = new Error(`Access denied: ${filePath} is outside workspace`);
                        if (callback) { callback(err); }
                        else if (typeof options === 'function') { options(err); }
                        return;
                    }
                    return fs.readFile(filePath, options, callback);
                },
                readdirSync: (dirPath: string, options?: any) => {
                    if (!isPathAllowed(dirPath)) {
                        throw new Error(`Access denied: ${dirPath} is outside workspace`);
                    }
                    return fs.readdirSync(dirPath, options);
                },
                statSync: (filePath: string, options?: any) => {
                    if (!isPathAllowed(filePath)) {
                        throw new Error(`Access denied: ${filePath} is outside workspace`);
                    }
                    return fs.statSync(filePath, options);
                },
                existsSync: (filePath: string) => {
                    if (!isPathAllowed(filePath)) {
                        return false;
                    }
                    return fs.existsSync(filePath);
                }
            };

            const context = {
                fs: sandboxedFs,
                path,
                workspaceFolders,
                console: console,
                result: undefined as unknown
            };
            vm.createContext(context);

            const wrappedCode = `result = (async () => { ${code} })()`;
            vm.runInContext(wrappedCode, context, { timeout: 5000 });

            const result = await context.result;
            Logger.debug('AiAgentTools', 'Async code execution result', { result });
            AgentLogger.getInstance().logCodeExecution(code, result);
            return result;
        } catch (error: any) {
            Logger.error('AiAgentTools', 'Async code execution failed', error);
            return { error: error.message };
        }
    }
}
