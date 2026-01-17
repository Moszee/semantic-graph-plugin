import OpenAI from 'openai';
import * as vscode from 'vscode';
import { GraphStore } from '../store/GraphStore';
import { GraphDelta, IntentNode } from '../lib/types';
import { loadPlanningAgentPrompt, loadImplementationInstructionsTemplate, loadNodeRefinementPrompt, fillTemplate } from '../lib/prompts';
import { Logger } from '../lib/Logger';
import { AgentLogger } from '../lib/AgentLogger';

/**
 * Agent tools for RAG queries.
 */
const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    }
];

/**
 * Planning agent for creating intents.
 */
export class PlanningAgent {
    private static MAX_SUB_AGENTS = 5;
    private store: GraphStore;
    private activeSubAgentCount = 0;

    constructor(store: GraphStore) {
        this.store = store;
        Logger.debug('PlanningAgent', 'PlanningAgent initialized');
    }

    /**
     * Create OpenAI client with current settings.
     */
    private createClient(): OpenAI {
        const config = vscode.workspace.getConfiguration('intentGraph');
        const apiKey = config.get<string>('openaiApiKey') || '';
        const baseURL = config.get<string>('openaiBaseUrl');

        Logger.debug('PlanningAgent', 'Creating OpenAI client', {
            hasApiKey: !!apiKey,
            baseURL: baseURL || 'default (api.openai.com)'
        });

        return new OpenAI({
            apiKey,
            ...(baseURL ? { baseURL } : {})
        });
    }

    /**
     * Execute an async function with retry logic for rate limit errors.
     */
    private async withRetry<T>(
        fn: () => Promise<T>,
        maxRetries: number = 3,
        context: string = 'API call'
    ): Promise<T> {
        let lastError: any;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;

                // Check if it's a rate limit error (429)
                if (error?.status === 429) {
                    const retryAfter = this.extractRetryAfter(error);
                    const waitSeconds = retryAfter || Math.pow(2, attempt) * 20; // Exponential backoff: 20s, 40s, 80s

                    Logger.warn('PlanningAgent', `Rate limit hit during ${context}, retrying in ${waitSeconds}s (attempt ${attempt + 1}/${maxRetries})`, { error });
                    vscode.window.showWarningMessage(`Rate limit reached. Waiting ${waitSeconds} seconds before retry... (${attempt + 1}/${maxRetries})`);

                    await this.sleep(waitSeconds * 1000);
                    continue;
                }

                // For non-rate-limit errors, throw immediately
                throw error;
            }
        }

        // All retries exhausted
        throw lastError;
    }

    /**
     * Extract retry-after time from rate limit error message.
     */
    private extractRetryAfter(error: any): number | null {
        const message = error?.message || '';
        // Error message format: "Rate limit of 1 per 60s exceeded for UserByModelByMinute. Please wait 0 seconds before retrying."
        const match = message.match(/wait (\d+) seconds/i);
        if (match) {
            const seconds = parseInt(match[1], 10);
            return seconds > 0 ? seconds : 60; // Default to 60s if parsing gives 0
        }
        return null;
    }

    /**
     * Sleep for specified milliseconds.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate a new intention based on user prompt.
     */
    async generateIntention(userPrompt: string): Promise<GraphDelta | null> {
        Logger.info('PlanningAgent', 'Generating intention', { userPrompt });

        const config = vscode.workspace.getConfiguration('intentGraph');
        const model = config.get<string>('openaiModel') || 'gpt-4o';
        const client = this.createClient();

        Logger.debug('PlanningAgent', 'Using model', { model });

        // Load system prompt from external file
        let systemPrompt: string;
        try {
            systemPrompt = loadPlanningAgentPrompt();
            Logger.debug('PlanningAgent', 'Loaded system prompt from file', {
                promptLength: systemPrompt.length
            });
        } catch (error) {
            // Fallback to inline prompt if file not found
            systemPrompt = 'You are an Intent Graph architect. Create graph deltas in YAML format.';
            Logger.warn('PlanningAgent', 'Failed to load system prompt from file, using fallback', { error });
        }

        // Append current graph context using summary instead of full JSON
        const graphSummary = this.generateGraphSummary();
        systemPrompt = fillTemplate(systemPrompt, {
            'GRAPH_SUMMARY': graphSummary
        });
        Logger.debug('PlanningAgent', 'Added graph context summary to prompt', { graphSummary });

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        try {
            Logger.info('PlanningAgent', 'Sending initial request to OpenAI API');
            AgentLogger.getInstance().logPromptSent('planning-agent', { userPrompt });
            let response = await this.withRetry(
                () => client.chat.completions.create({
                    model,
                    messages,
                    tools: TOOLS,
                    tool_choice: 'auto',
                    response_format: { type: 'json_object' }
                }),
                3,
                'initial request'
            );
            Logger.debug('PlanningAgent', 'Received initial response', {
                hasToolCalls: !!response.choices[0].message.tool_calls,
                finishReason: response.choices[0].finish_reason,
                fullResponse: JSON.stringify(response, null, 2)
            });

            // Handle tool calls in a loop
            let iteration = 0;
            while (response.choices[0].message.tool_calls) {
                iteration++;
                const toolCalls = response.choices[0].message.tool_calls;
                Logger.info('PlanningAgent', `Processing tool calls (iteration ${iteration})`, {
                    toolCallCount: toolCalls.length,
                    tools: toolCalls.map(tc => tc.function.name)
                });

                messages.push(response.choices[0].message);

                for (const toolCall of toolCalls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    Logger.debug('PlanningAgent', `Executing tool: ${toolCall.function.name}`, {
                        toolCallId: toolCall.id,
                        arguments: args
                    });

                    const result = this.executeTool(toolCall.function.name, args);
                    AgentLogger.getInstance().logToolCall(toolCall.function.name, args);
                    Logger.debug('PlanningAgent', `Tool result: ${toolCall.function.name}`, { result });

                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result)
                    });
                }

                Logger.info('PlanningAgent', 'Sending follow-up request to OpenAI API');
                response = await this.withRetry(
                    () => client.chat.completions.create({
                        model,
                        messages,
                        tools: TOOLS,
                        tool_choice: 'auto',
                        response_format: { type: 'json_object' }
                    }),
                    3,
                    `follow-up request (iteration ${iteration})`
                );
                Logger.debug('PlanningAgent', 'Received follow-up response', {
                    hasToolCalls: !!response.choices[0].message.tool_calls,
                    finishReason: response.choices[0].finish_reason,
                    fullResponse: JSON.stringify(response, null, 2)
                });
            }

            const content = response.choices[0].message.content || '';
            Logger.debug('PlanningAgent', 'Final response content', {
                contentLength: content.length,
                contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
            });

            const intent = this.parseIntentFromResponse(content);
            if (intent) {
                Logger.info('PlanningAgent', 'Successfully parsed intent', {
                    intentName: intent.name,
                    operationCount: intent.operations?.length || 0
                });
            } else {
                Logger.warn('PlanningAgent', 'Failed to parse intent from response', { content });
            }
            AgentLogger.getInstance().logResponseReceived(
                intent ? `Generated: ${intent.name}` : 'Failed to parse response',
                { content }
            );
            return intent;

        } catch (error) {
            Logger.error('PlanningAgent', 'Agent error during intention generation', error);
            AgentLogger.getInstance().logError('Intention generation failed', error);
            vscode.window.showErrorMessage(`Agent error: ${error}`);
            return null;
        }
    }

    /**
     * Tweak an existing node based on user prompt.
     * Supports tool calling to query both base graph and current delta.
     */
    async tweakNode(nodeId: string, userPrompt: string): Promise<GraphDelta | null> {
        Logger.info('PlanningAgent', 'Tweaking node with AI', { nodeId, userPrompt });

        // Get the node from the store (searches base + delta)
        const node = this.store.getNode(nodeId);
        if (!node) {
            Logger.error('PlanningAgent', 'Node not found for tweaking', { nodeId });
            vscode.window.showErrorMessage(`Node not found: ${nodeId}`);
            return null;
        }

        // Get connected nodes for immediate context
        const allNodes = this.store.getMergedNodes();
        const connectedNodes = allNodes.filter(n =>
            (node.inputs?.includes(n.id) || node.outputs?.includes(n.id) ||
                n.inputs?.includes(nodeId) || n.outputs?.includes(nodeId)) &&
            n.id !== nodeId
        );

        const config = vscode.workspace.getConfiguration('intentGraph');
        const model = config.get<string>('openaiModel') || 'gpt-4o';
        const client = this.createClient();

        Logger.debug('PlanningAgent', 'Using model for node tweak', { model, connectedNodeCount: connectedNodes.length });

        // Generate graph summary for tool context
        const graphSummary = this.generateMergedGraphSummary();

        // Load system prompt from external file with template filling
        let systemPrompt: string;
        try {
            const promptTemplate = loadNodeRefinementPrompt();
            systemPrompt = fillTemplate(promptTemplate, {
                'FOCAL_NODE': JSON.stringify(node, null, 2),
                'CONNECTED_NODES': connectedNodes.length > 0
                    ? JSON.stringify(connectedNodes, null, 2)
                    : '(no connected nodes)',
                'GRAPH_SUMMARY': graphSummary
            });
            Logger.debug('PlanningAgent', 'Loaded node refinement prompt from file');
        } catch (error) {
            Logger.warn('PlanningAgent', 'Failed to load node refinement prompt, using fallback', { error });
            systemPrompt = `You are an Intent Graph architect. Refine the node based on user request. Return a valid JSON GraphDelta.

Focal node: ${JSON.stringify(node, null, 2)}
Connected nodes: ${connectedNodes.length > 0 ? JSON.stringify(connectedNodes, null, 2) : '(none)'}

${graphSummary}`;
        }

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        try {
            Logger.info('PlanningAgent', 'Sending node tweak request to OpenAI API');
            AgentLogger.getInstance().logPromptSent('node-refinement', { nodeId, userPrompt });
            let response = await this.withRetry(
                () => client.chat.completions.create({
                    model,
                    messages,
                    tools: TOOLS,
                    tool_choice: 'auto',
                    response_format: { type: 'json_object' }
                }),
                3,
                'node tweak request'
            );
            Logger.debug('PlanningAgent', 'Received node tweak response', {
                hasToolCalls: !!response.choices[0].message.tool_calls,
                finishReason: response.choices[0].finish_reason
            });

            // Handle tool calls in a loop
            let iteration = 0;
            while (response.choices[0].message.tool_calls) {
                iteration++;
                const toolCalls = response.choices[0].message.tool_calls;
                Logger.info('PlanningAgent', `Processing tool calls for node tweak (iteration ${iteration})`, {
                    toolCallCount: toolCalls.length,
                    tools: toolCalls.map(tc => tc.function.name)
                });

                messages.push(response.choices[0].message);

                for (const toolCall of toolCalls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    Logger.debug('PlanningAgent', `Executing tool (merged): ${toolCall.function.name}`, {
                        toolCallId: toolCall.id,
                        arguments: args
                    });

                    // Use merged tool execution (base + delta)
                    const result = this.executeToolMerged(toolCall.function.name, args);
                    AgentLogger.getInstance().logToolCall(toolCall.function.name, args);
                    Logger.debug('PlanningAgent', `Tool result: ${toolCall.function.name}`, { result });

                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result)
                    });
                }

                Logger.info('PlanningAgent', 'Sending follow-up request for node tweak');
                response = await this.withRetry(
                    () => client.chat.completions.create({
                        model,
                        messages,
                        tools: TOOLS,
                        tool_choice: 'auto',
                        response_format: { type: 'json_object' }
                    }),
                    3,
                    `node tweak follow-up (iteration ${iteration})`
                );
                Logger.debug('PlanningAgent', 'Received follow-up response', {
                    hasToolCalls: !!response.choices[0].message.tool_calls,
                    finishReason: response.choices[0].finish_reason
                });
            }

            const content = response.choices[0].message.content || '';
            Logger.debug('PlanningAgent', 'Node tweak response content', {
                contentLength: content.length,
                contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
            });

            const delta = this.parseIntentFromResponse(content);
            if (delta) {
                Logger.info('PlanningAgent', 'Successfully parsed delta for node tweak', {
                    deltaName: delta.name,
                    operationCount: delta.operations?.length || 0
                });
            } else {
                Logger.warn('PlanningAgent', 'Failed to parse delta from node tweak response', { content });
            }
            AgentLogger.getInstance().logResponseReceived(
                delta ? `Tweaked: ${delta.name}` : 'Failed to parse response',
                { content }
            );
            return delta;

        } catch (error) {
            Logger.error('PlanningAgent', 'Agent error during node tweak', error);
            AgentLogger.getInstance().logError('Node tweak failed', error);
            vscode.window.showErrorMessage(`Agent error: ${error}`);
            return null;
        }
    }

    /**
     * Execute a tool call.
     */
    private executeTool(name: string, args: Record<string, unknown>): unknown {
        switch (name) {
            case 'get_node':
                return this.store.getNode(args.id as string);
            case 'get_subgraph':
                return this.store.getSubgraph(args.entryPointId as string);
            case 'find_nodes':
                return this.store.findNodes(args.filters as string[][]);
            case 'execute_code':
                return this.executeCode(args.code as string);
            case 'spawn_agent':
                return this.spawnSubAgent(args.task as string, args.context as string | undefined);
            default:
                Logger.warn('PlanningAgent', `Unknown tool called: ${name}`, { args });
                return { error: `Unknown tool: ${name}` };
        }
    }

    /**
     * Execute a tool call using merged graph (base + delta).
     * This allows the AI to see nodes from both the committed graph and the current delta.
     */
    private executeToolMerged(name: string, args: Record<string, unknown>): unknown {
        const mergedNodes = this.store.getMergedNodes();
        const nodeMap = new Map(mergedNodes.map(n => [n.id, n]));

        switch (name) {
            case 'get_node':
                return nodeMap.get(args.id as string) ?? null;
            case 'get_subgraph': {
                // BFS traversal from entry point using merged nodes
                const result: IntentNode[] = [];
                const visited = new Set<string>();
                const queue: string[] = [args.entryPointId as string];

                while (queue.length > 0) {
                    const nodeId = queue.shift()!;
                    if (visited.has(nodeId)) continue;
                    visited.add(nodeId);

                    const node = nodeMap.get(nodeId);
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
            case 'find_nodes': {
                const filters = args.filters as string[][];
                return mergedNodes.filter(node => {
                    if (!node.entryPoints || node.entryPoints.length === 0) return false;

                    return filters.some(filterGroup => {
                        return node.entryPoints!.some(ep => {
                            const epName = ep.name.toLowerCase();
                            return filterGroup.every(term => epName.includes(term.toLowerCase()));
                        });
                    });
                });
            }
            case 'execute_code':
                return this.executeCode(args.code as string);
            case 'spawn_agent':
                return this.spawnSubAgent(args.task as string, args.context as string | undefined);
            default:
                Logger.warn('PlanningAgent', `Unknown tool called: ${name}`, { args });
                return { error: `Unknown tool: ${name}` };
        }
    }

    /**
     * Execute JavaScript code in a sandboxed context.
     * Provides access to store, vscode APIs, and secured filesystem (workspace only).
     */
    private async executeCode(code: string): Promise<unknown> {
        Logger.info('PlanningAgent', 'Executing code', { codeLength: code.length });
        try {
            const vm = require('vm');
            const fs = require('fs');
            const path = require('path');

            // Get workspace folders for project access
            const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];

            // Validate that a path is within allowed workspace folders
            const isPathAllowed = (targetPath: string): boolean => {
                const resolved = path.resolve(targetPath);
                return workspaceFolders.some(folder =>
                    resolved.startsWith(folder + path.sep) || resolved === folder
                );
            };

            // Create sandboxed fs that only allows access within workspace
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
                        if (callback) callback(err);
                        else if (typeof options === 'function') options(err);
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
                        return false; // Report as non-existent rather than error
                    }
                    return fs.existsSync(filePath);
                }
            };

            const context = {
                store: this.store,
                vscode,
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
            Logger.debug('PlanningAgent', 'Code execution result', { result });
            return result;
        } catch (error: any) {
            Logger.error('PlanningAgent', 'Code execution failed', error);
            return { error: error.message };
        }
    }

    /**
     * Spawn a sub-agent to perform a delegated task.
     * Limited to MAX_SUB_AGENTS concurrent agents.
     */
    private async spawnSubAgent(task: string, context?: string): Promise<GraphDelta | null> {
        Logger.info('PlanningAgent', 'Spawning sub-agent', { task, hasContext: !!context });

        if (this.activeSubAgentCount >= PlanningAgent.MAX_SUB_AGENTS) {
            Logger.warn('PlanningAgent', 'Sub-agent limit reached', {
                current: this.activeSubAgentCount,
                max: PlanningAgent.MAX_SUB_AGENTS
            });
            return null;
        }

        this.activeSubAgentCount++;
        AgentLogger.getInstance().logToolCall('spawn_agent', { task, context, agentCount: this.activeSubAgentCount });

        try {
            const prompt = context ? `${context}\n\nTask: ${task}` : task;
            const result = await this.generateIntention(prompt);
            Logger.info('PlanningAgent', 'Sub-agent completed', { hasResult: !!result });
            return result;
        } finally {
            this.activeSubAgentCount--;
        }
    }

    /**
     * Generate a concise graph summary for merged graph (base + delta).
     * Used by tweakNode to give the AI visibility into the current working state.
     */
    private generateMergedGraphSummary(): string {
        const nodes = this.store.getMergedNodes();
        const nodeList = nodes.map(n => `${n.id} (${n.type}): ${n.name}`).join('\n- ');
        const entryPoints = nodes
            .flatMap(n => n.entryPoints || [])
            .map(ep => `${ep.type}: ${ep.name}`)
            .slice(0, 15)
            .join('\n- ');

        return [
            'AVAILABLE TOOLS: get_node, get_subgraph, find_nodes',
            'Use these tools to explore the graph before making changes.',
            '',
            `Total nodes: ${nodes.length}`,
            '',
            'Available nodes:',
            nodeList ? `- ${nodeList}` : '(none)',
            '',
            'Entry points:',
            entryPoints ? `- ${entryPoints}` : '(none)'
        ].join('\n');
    }


    /**
     * Parse intent from LLM response.
     * With JSON mode enabled, the entire response should be valid JSON.
     * Falls back to extracting from code blocks for backwards compatibility.
     */
    private parseIntentFromResponse(content: string): GraphDelta | null {
        // Try parsing the entire content as JSON (OpenAI JSON mode)
        try {
            const parsed = JSON.parse(content) as GraphDelta;
            Logger.debug('PlanningAgent', 'Parsed direct JSON successfully', { parsed });
            return parsed;
        } catch (error) {
            Logger.debug('PlanningAgent', 'Content is not direct JSON, trying code block extraction');
        }

        // Fallback: Try extracting JSON from code blocks
        const jsonMatch = content.match(/```json\n([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]) as GraphDelta;
                Logger.debug('PlanningAgent', 'Parsed JSON from code block successfully', { parsed });
                return parsed;
            } catch (error) {
                Logger.error('PlanningAgent', 'Failed to parse JSON from code block', error);
            }
        }

        // Fallback to YAML for backwards compatibility
        const yamlMatch = content.match(/```ya?ml\n([\s\S]*?)```/);
        if (yamlMatch) {
            try {
                const yaml = require('js-yaml');
                const parsed = yaml.load(yamlMatch[1]) as GraphDelta;
                Logger.debug('PlanningAgent', 'Parsed YAML successfully', { parsed });
                return parsed;
            } catch (error) {
                Logger.error('PlanningAgent', 'Failed to parse YAML from response', error);
                return null;
            }
        }

        Logger.warn('PlanningAgent', 'No valid JSON or YAML found in response', {
            contentPreview: content.substring(0, 200)
        });
        return null;
    }

    /**
     * Generate a concise graph summary for prompt context.
     * Provides node IDs and entry points without full node details.
     */
    private generateGraphSummary(): string {
        const nodes = this.store.getNodes();
        const nodeList = nodes.map(n => `${n.id} (${n.type}): ${n.name}`).join('\n- ');
        const entryPoints = nodes
            .flatMap(n => n.entryPoints || [])
            .map(ep => `${ep.type}: ${ep.name}`)
            .slice(0, 15)
            .join('\n- ');

        return [
            `Node count: ${nodes.length}`,
            '',
            'Available nodes:',
            nodeList ? `- ${nodeList}` : '(none)',
            '',
            'Entry points:',
            entryPoints ? `- ${entryPoints}` : '(none)'
        ].join('\n');
    }
}

/**
 * Generate instructions for Antigravity Agent to implement an intent.
 */
export function generateImplementationInstructions(intent: GraphDelta, nodes: IntentNode[]): string {
    // Build operations description
    const operationsLines: string[] = [];
    const allQuestions: string[] = [];

    for (const op of intent.operations || []) {
        // Collect questions from each operation's node
        if (op.node.questions?.length) {
            allQuestions.push(...op.node.questions.map(q => `- ${op.node.name}: ${q}`));
        }

        switch (op.operation) {
            case 'add':
                operationsLines.push(`### ADD: ${op.node.name} (${op.node.type})`);
                operationsLines.push(`- **ID**: ${op.node.id}`);
                operationsLines.push(`- **Description**: ${op.node.description}`);
                if (op.node.inputs?.length) {
                    operationsLines.push(`- **Depends on**: ${op.node.inputs.join(', ')}`);
                }
                if (op.node.outputs?.length) {
                    operationsLines.push(`- **Produces for**: ${op.node.outputs.join(', ')}`);
                }
                if (op.node.invariants?.length) {
                    operationsLines.push(`- **Invariants (MUST hold)**: ${op.node.invariants.join('; ')}`);
                }
                operationsLines.push('');
                break;
            case 'update':
                operationsLines.push(`### UPDATE: ${op.node.name} (${op.node.id})`);
                operationsLines.push(`- **New Description**: ${op.node.description}`);
                operationsLines.push('');
                break;
            case 'remove':
                operationsLines.push(`### REMOVE: ${op.node.name} (${op.node.id})`);
                operationsLines.push('');
                break;
        }
    }

    // Build node IDs list
    const nodeIds = nodes.slice(0, 20).map(n => n.id).join(', ');

    // Format questions
    const questionsText = allQuestions.length > 0
        ? allQuestions.join('\n')
        : '(No questions - proceed with implementation)';

    // Try to load template from file
    try {
        const template = loadImplementationInstructionsTemplate();
        return fillTemplate(template, {
            'INTENT_NAME': intent.name,
            'INTENT_DESCRIPTION': intent.description || 'No description provided.',
            'OPERATIONS': operationsLines.join('\n'),
            'NODE_IDS': nodeIds || '(none)',
            'QUESTIONS': questionsText
        });
    } catch {
        // Fallback to inline format if template not found
        return [
            `# Implementation Instructions for Intent: ${intent.name}`,
            '',
            `## Description`,
            intent.description || 'No description provided.',
            '',
            `## Changes to Implement`,
            '',
            ...operationsLines,
            '',
            `## Questions to Address`,
            questionsText,
            '',
            `## Context`,
            `Related nodes: ${nodeIds}`
        ].join('\n');
    }
}

