import OpenAI from 'openai';
import * as vscode from 'vscode';
import { GraphStore } from '../store/GraphStore';
import { GraphDelta, IntentNode } from '../lib/types';
import { loadPlanningAgentPrompt, loadImplementationInstructionsTemplate, fillTemplate } from '../lib/prompts';
import { Logger } from '../lib/Logger';

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
    }
];

/**
 * Planning agent for creating intents.
 */
export class PlanningAgent {
    private store: GraphStore;

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

        // Append current graph context
        const nodes = this.store.getNodes();
        systemPrompt += `\n\nCurrent graph nodes: ${JSON.stringify(nodes)}`;
        Logger.debug('PlanningAgent', 'Added graph context to prompt', { nodeCount: nodes.length });

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        try {
            Logger.info('PlanningAgent', 'Sending initial request to OpenAI API');
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
            return intent;

        } catch (error) {
            Logger.error('PlanningAgent', 'Agent error during intention generation', error);
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
            default:
                Logger.warn('PlanningAgent', `Unknown tool called: ${name}`, { args });
                return { error: `Unknown tool: ${name}` };
        }
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
}

/**
 * Generate instructions for Antigravity Agent to implement an intent.
 */
export function generateImplementationInstructions(intent: GraphDelta, nodes: IntentNode[]): string {
    // Build operations description
    const operationsLines: string[] = [];
    for (const op of intent.operations || []) {
        switch (op.operation) {
            case 'add':
                operationsLines.push(`### ADD: ${op.node.name} (${op.node.type})`);
                operationsLines.push(`- **ID**: ${op.node.id}`);
                operationsLines.push(`- **Description**: ${op.node.description}`);
                if (op.node.inputs?.length) {
                    operationsLines.push(`- **Depends on**: ${op.node.inputs.map(i => i.nodeId).join(', ')}`);
                }
                if (op.node.outputs?.length) {
                    operationsLines.push(`- **Produces for**: ${op.node.outputs.map(o => o.nodeId).join(', ')}`);
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

    // Build context nodes description
    const contextLines: string[] = [];
    for (const node of nodes.slice(0, 10)) {
        contextLines.push(`- **${node.name}** (${node.type}): ${node.description?.slice(0, 150) || 'No description'}`);
    }

    // Try to load template from file
    try {
        const template = loadImplementationInstructionsTemplate();
        return fillTemplate(template, {
            'INTENT_NAME': intent.name,
            'INTENT_DESCRIPTION': intent.description || 'No description provided.',
            'OPERATIONS': operationsLines.join('\n'),
            'CONTEXT_NODES': contextLines.join('\n')
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
            `## Context`,
            'Current related nodes in the graph:',
            ...contextLines
        ].join('\n');
    }
}
