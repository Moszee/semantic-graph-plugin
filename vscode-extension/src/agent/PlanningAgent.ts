import OpenAI from 'openai';
import * as vscode from 'vscode';
import { GraphStore } from '../store/GraphStore';
import { GraphDelta, IntentNode } from '../lib/types';
import { loadPlanningAgentPrompt, loadNodeRefinementPrompt, fillTemplate } from '../lib/prompts';
import { Logger } from '../lib/Logger';
import { AgentLogger } from '../lib/AgentLogger';
import { AiAgentClient } from './AiAgentClient';
import { AiAgentTools } from './AiAgentTools';

/**
 * Agent tools for RAG queries.
 */
// TOOLS constant removed (migrated to AiAgentTools)

/**
 * Planning agent for creating intents.
 */
export class PlanningAgent {
    private static MAX_SUB_AGENTS = 5;
    private store: GraphStore;
    private activeSubAgentCount = 0;
    private aiClient: AiAgentClient;
    private tools: AiAgentTools;

    constructor(store: GraphStore) {
        this.store = store;
        this.aiClient = AiAgentClient.getInstance();
        this.tools = new AiAgentTools(store, this.spawnSubAgent.bind(this));
        Logger.debug('PlanningAgent', 'PlanningAgent initialized');
    }

    /**
     * Generate a new intention based on user prompt.
     */
    async generateIntention(userPrompt: string): Promise<GraphDelta | null> {
        Logger.info('PlanningAgent', 'Generating intention', { userPrompt });

        const model = this.aiClient.getModel();
        const client = this.aiClient.createClient();
        const tools = this.tools.getPlanningTools();

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

            const content = await this.aiClient.chatWithTools(
                messages,
                tools,
                async (name, args) => {
                    AgentLogger.getInstance().logToolCall(name, args);
                    return await this.tools.executeTool(name, args);
                },
                {
                    context: 'initial request',
                    jsonMode: true,
                    showNotifications: true
                }
            );


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
     * Refine an existing intent based on user prompt.
     * Allows modifying the entire intent with new operations.
     */
    async refineIntent(intent: GraphDelta, userPrompt: string): Promise<GraphDelta | null> {
        Logger.info('PlanningAgent', 'Refining intent with AI', { intentName: intent.name, userPrompt });

        const model = this.aiClient.getModel();
        const client = this.aiClient.createClient();
        const tools = this.tools.getPlanningTools();

        Logger.debug('PlanningAgent', 'Using model for intent refinement', { model, operationCount: intent.operations.length });

        // Generate graph summary for tool context
        const graphSummary = this.generateMergedGraphSummary();

        // Build current intent summary
        const intentSummary = intent.operations.map(op =>
            `- [${op.operation}] ${op.node.id} (${op.node.type}): ${op.node.name}`
        ).join('\n');

        // System prompt for intent refinement
        const systemPrompt = `You are an Intent Graph architect. Refine the given intent based on user request.

# CURRENT INTENT
Name: ${intent.name}
Description: ${intent.description}

## Current Operations
${intentSummary || '(no operations yet)'}

## Available Tools
- get_node(id): Get full details of a node by its ID
- get_subgraph(entryPointId): Get all nodes reachable from an entry point
- find_nodes(filters): Find nodes by entry point filters

${graphSummary}

# RULES
1. [MUST] Return valid JSON (JSON mode is enabled)
2. [MUST] Use unique, descriptive IDs for new nodes (snake_case)
3. [MUST] Ensure inputs/outputs references are consistent across all nodes
4. [MUST] If the user references a node, use get_node to fetch its details first
5. [SHOULD] Use tools to explore related nodes before making changes
6. [AVOID] Quotation marks (" or ') in descriptions and names

# OUTPUT FORMAT
Return a valid JSON GraphDelta object with new/updated operations to apply to the intent.`;

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        try {
            Logger.info('PlanningAgent', 'Sending intent refinement request to OpenAI API');
            AgentLogger.getInstance().logPromptSent('intent-refinement', { intentName: intent.name, userPrompt });

            const content = await this.aiClient.chatWithTools(
                messages,
                tools,
                async (name, args) => {
                    AgentLogger.getInstance().logToolCall(name, args);
                    return await this.tools.executeTool(name, args, intent);
                },
                {
                    context: 'intent refinement request',
                    jsonMode: true,
                    showNotifications: true
                }
            );

            const delta = this.parseIntentFromResponse(content);
            if (delta) {
                Logger.info('PlanningAgent', 'Successfully parsed delta for intent refinement', {
                    deltaName: delta.name,
                    operationCount: delta.operations?.length || 0
                });
            } else {
                Logger.warn('PlanningAgent', 'Failed to parse delta from intent refinement response', { content });
            }
            AgentLogger.getInstance().logResponseReceived(
                delta ? `Refined: ${delta.name}` : 'Failed to parse response',
                { content }
            );
            return delta;

        } catch (error) {
            Logger.error('PlanningAgent', 'Agent error during intent refinement', error);
            AgentLogger.getInstance().logError('Intent refinement failed', error);
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

        const model = this.aiClient.getModel();
        const client = this.aiClient.createClient();
        const tools = this.tools.getPlanningTools();

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
                    ? connectedNodes.map(n => `- ${n.id} (${n.type}): ${n.name}`).join('\n')
                    : '(no connected nodes)',
                'GRAPH_SUMMARY': graphSummary
            });
            Logger.debug('PlanningAgent', 'Loaded node refinement prompt from file');
        } catch (error) {
            Logger.warn('PlanningAgent', 'Failed to load node refinement prompt, using fallback', { error });
            systemPrompt = `You are an Intent Graph architect. Refine the node based on user request. Return a valid JSON GraphDelta.

Focal node: ${JSON.stringify(node, null, 2)}
Connected nodes (use get_node to get full details): ${connectedNodes.length > 0 ? connectedNodes.map(n => `${n.id} (${n.type}): ${n.name}`).join(', ') : '(none)'}

${graphSummary}`;
        }

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        try {
            Logger.info('PlanningAgent', 'Sending node tweak request to OpenAI API');
            AgentLogger.getInstance().logPromptSent('node-refinement', { nodeId, userPrompt });

            const content = await this.aiClient.chatWithTools(
                messages,
                tools,
                async (name, args) => {
                    AgentLogger.getInstance().logToolCall(name, args);
                    // Pass the store's currently selected intent to get merged context
                    const currentIntent = this.store.getSelectedIntent();
                    return await this.tools.executeTool(name, args, currentIntent || undefined);
                },
                {
                    context: 'node tweak request',
                    jsonMode: true,
                    showNotifications: true
                }
            );


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
