import OpenAI from 'openai';
import { Logger } from '../lib/Logger';
import { AgentLogger } from '../lib/AgentLogger';
import { loadImplementationAgentPrompt, fillTemplate } from '../lib/prompts';
import { AiAgentClient } from './AiAgentClient';
import { AiAgentTools } from './AiAgentTools';

/**
 * Result of an implementation agent execution.
 */
export interface ImplementationResult {
    implementation: string;
    explanation: string;
}

// TOOLS constant removed (migrated to AiAgentTools)

/**
 * Agent focused on implementing a single class.
 * Uses OpenAI to generate code based on task description and codebase exploration.
 */
export class ImplementationAgent {
    private aiClient: AiAgentClient;
    private tools: AiAgentTools;

    constructor() {
        this.aiClient = AiAgentClient.getInstance();
        this.tools = new AiAgentTools();
    }

    /**
     * Implement a single class based on task description.
     */
    async implement(
        task: string,
        targetFile: string,
        className: string,
        context?: string
    ): Promise<ImplementationResult> {
        Logger.info('ImplementationAgent', 'Starting implementation', { task, targetFile, className });

        const model = this.aiClient.getModel();
        const client = this.aiClient.createClient();
        const tools = this.tools.getImplementationTools();

        let systemPrompt: string;
        try {
            const promptTemplate = loadImplementationAgentPrompt();
            systemPrompt = fillTemplate(promptTemplate, {
                'TARGET_FILE': targetFile,
                'CLASS_NAME': className,
                'TASK_DESCRIPTION': task,
                'CONTEXT': context || ''
            });
        } catch (error) {
            Logger.warn('ImplementationAgent', 'Failed to load prompt template, using fallback', { error });
            systemPrompt = `You are an implementation agent. Implement a class named ${className} for file ${targetFile}. Task: ${task}. Return JSON with "implementation" and "explanation" fields.`;
        }

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Implement the ${className} class as described.` }
        ];


        try {
            AgentLogger.getInstance().logPromptSent('implementation-agent', { task, targetFile, className });

            const content = await this.aiClient.chatWithTools(
                messages,
                tools,
                async (name, args) => {
                    AgentLogger.getInstance().logToolCall(name, args);
                    return await this.tools.executeTool(name, args);
                },
                {
                    context: 'implementation request',
                    jsonMode: true,
                    showNotifications: false
                }
            );

            Logger.debug('ImplementationAgent', 'Final response', { contentLength: content.length });

            const result = JSON.parse(content) as ImplementationResult;
            Logger.info('ImplementationAgent', 'Implementation complete', {
                implementationLength: result.implementation?.length || 0
            });

            AgentLogger.getInstance().logResponseReceived(
                `Implementation completed: ${className}`,
                { implementationLength: result.implementation?.length || 0 }
            );

            return result;

        } catch (error) {
            Logger.error('ImplementationAgent', 'Implementation failed', error);
            AgentLogger.getInstance().logError('Implementation failed', error);
            throw error;
        }
    }
}
