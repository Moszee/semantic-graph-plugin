import OpenAI from 'openai';
import * as vscode from 'vscode';
import { Logger } from '../lib/Logger';

/**
 * Shared OpenAI client and utilities for AI agents.
 * Provides common functionality like client creation, retry logic, and sandboxed code execution.
 */
export class AiAgentClient {
    private static instance: AiAgentClient | null = null;

    /**
     * Get singleton instance.
     */
    static getInstance(): AiAgentClient {
        if (!AiAgentClient.instance) {
            AiAgentClient.instance = new AiAgentClient();
        }
        return AiAgentClient.instance;
    }

    /**
     * Create OpenAI client with current settings.
     */
    createClient(): OpenAI {
        const config = vscode.workspace.getConfiguration('intentGraph');
        const apiKey = config.get<string>('openaiApiKey') || '';
        const baseURL = config.get<string>('openaiBaseUrl');

        Logger.debug('AiAgentClient', 'Creating OpenAI client', {
            hasApiKey: !!apiKey,
            baseURL: baseURL || 'default (api.openai.com)'
        });

        return new OpenAI({
            apiKey,
            ...(baseURL ? { baseURL } : {})
        });
    }

    /**
     * Get configured model name.
     */
    getModel(): string {
        const config = vscode.workspace.getConfiguration('intentGraph');
        return config.get<string>('openaiModel') || 'gpt-4o';
    }

    /**
     * Sleep for specified milliseconds.
     */
    sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Extract retry-after time from rate limit error message.
     */
    extractRetryAfter(error: any): number | null {
        const message = error?.message || '';
        const match = message.match(/wait (\d+) seconds/i);
        if (match) {
            const seconds = parseInt(match[1], 10);
            return seconds > 0 ? seconds : 60;
        }
        return null;
    }

    /**
     * Execute an async function with retry logic for rate limit errors.
     */
    async withRetry<T>(
        fn: () => Promise<T>,
        maxRetries: number = 3,
        context: string = 'API call',
        showNotifications: boolean = true
    ): Promise<T> {
        let lastError: any;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;

                if (error?.status === 429) {
                    const retryAfter = this.extractRetryAfter(error);
                    const waitSeconds = retryAfter || Math.pow(2, attempt) * 20;

                    Logger.warn('AiAgentClient', `Rate limit hit during ${context}, retrying in ${waitSeconds}s (attempt ${attempt + 1}/${maxRetries})`, { error });

                    if (showNotifications) {
                        vscode.window.showWarningMessage(`Rate limit reached. Waiting ${waitSeconds} seconds before retry... (${attempt + 1}/${maxRetries})`);
                    }

                    await this.sleep(waitSeconds * 1000);
                    continue;
                }

                throw error;
            }
        }

        throw lastError;
    }

    /**
     * run chat with tools loop.
     */
    async chatWithTools(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: OpenAI.Chat.Completions.ChatCompletionTool[],
        toolHandler: (name: string, args: Record<string, unknown>) => Promise<unknown>,
        options: {
            context?: string;
            jsonMode?: boolean;
            showNotifications?: boolean;
        } = {}
    ): Promise<string> {
        const client = this.createClient();
        const model = this.getModel();
        const { context = 'chat', jsonMode = false, showNotifications = true } = options;

        try {
            Logger.info('AiAgentClient', `Starting chat with tools (${context})`);

            let response = await this.withRetry(
                () => client.chat.completions.create({
                    model,
                    messages,
                    tools,
                    tool_choice: 'auto',
                    response_format: jsonMode ? { type: 'json_object' } : undefined
                }),
                3,
                `${context} (initial)`,
                showNotifications
            );

            let iteration = 0;
            const MAX_ITERATIONS = 10;

            while (response.choices[0].message.tool_calls) {
                iteration++;
                if (iteration > MAX_ITERATIONS) {
                    throw new Error(`Tool call limit reached (${MAX_ITERATIONS})`);
                }

                const toolCalls = response.choices[0].message.tool_calls;
                Logger.info('AiAgentClient', `Processing tool calls (iteration ${iteration})`, {
                    count: toolCalls.length,
                    tools: toolCalls.map(tc => tc.function.name)
                });

                messages.push(response.choices[0].message);

                for (const toolCall of toolCalls) {
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        const result = await toolHandler(toolCall.function.name, args);

                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: typeof result === 'string' ? result : JSON.stringify(result)
                        });
                    } catch (error: any) {
                        Logger.error('AiAgentClient', `Tool execution failed: ${toolCall.function.name}`, error);
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: JSON.stringify({ error: error.message || 'Tool execution failed' })
                        });
                    }
                }

                response = await this.withRetry(
                    () => client.chat.completions.create({
                        model,
                        messages,
                        tools,
                        tool_choice: 'auto',
                        response_format: jsonMode ? { type: 'json_object' } : undefined
                    }),
                    3,
                    `${context} (iteration ${iteration})`,
                    showNotifications
                );
            }

            const content = response.choices[0].message.content || '';
            Logger.debug('AiAgentClient', 'Chat completed', { contentLength: content.length });
            return content;

        } catch (error: any) {
            Logger.error('AiAgentClient', `Chat failed (${context})`, error);
            throw error;
        }
    }
}
