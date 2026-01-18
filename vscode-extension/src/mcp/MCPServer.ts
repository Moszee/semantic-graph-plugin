import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Logger } from '../lib/Logger';
import { ImplementationAgent } from '../agent/ImplementationAgent';
import { AiAgentTools } from '../agent/AiAgentTools';

/**
 * Schema for execute_code tool input.
 */
const ExecuteCodeSchema = z.object({
    code: z.string().describe('JavaScript code to execute. Must return a value.')
});

/**
 * Schema for spawn_implementation_agent tool input.
 */
const SpawnImplementationAgentSchema = z.object({
    task: z.string().describe('The task description for what to implement'),
    targetFile: z.string().describe('Target file path for the implementation'),
    className: z.string().describe('Name of the class to implement'),
    context: z.string().optional().describe('Additional context about existing patterns or requirements')
});

/**
 * MCP Server that exposes tools to Antigravity IDE.
 */
export class MCPServer {
    private server: Server;
    private implementationAgent: ImplementationAgent;
    private tools: AiAgentTools;

    constructor() {
        this.server = new Server(
            {
                name: 'intent-graph',
                version: '0.0.1',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.implementationAgent = new ImplementationAgent();
        this.tools = new AiAgentTools();
        this.setupHandlers();
    }

    /**
     * Set up MCP request handlers.
     */
    private setupHandlers(): void {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'execute_code',
                        description: 'Execute JavaScript code in a sandboxed context with workspace access. Available: fs (read-only, sandboxed to workspace), path (Node.js path module), workspaceFolders (array of workspace folder paths), console.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                code: {
                                    type: 'string',
                                    description: 'JavaScript code to execute. Must return a value.'
                                }
                            },
                            required: ['code']
                        }
                    },
                    {
                        name: 'spawn_implementation_agent',
                        description: 'Spawn a focused sub-agent to implement a single class. Returns the implementation code - does NOT write files.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                task: {
                                    type: 'string',
                                    description: 'The task description for what to implement'
                                },
                                targetFile: {
                                    type: 'string',
                                    description: 'Target file path for the implementation'
                                },
                                className: {
                                    type: 'string',
                                    description: 'Name of the class to implement'
                                },
                                context: {
                                    type: 'string',
                                    description: 'Additional context about existing patterns or requirements'
                                }
                            },
                            required: ['task', 'targetFile', 'className']
                        }
                    }
                ]
            };
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            Logger.info('MCPServer', `Tool called: ${name}`, { args });

            switch (name) {
                case 'execute_code': {
                    const parsed = ExecuteCodeSchema.safeParse(args);
                    if (!parsed.success) {
                        return {
                            content: [{ type: 'text', text: `Invalid arguments: ${parsed.error.message}` }],
                            isError: true
                        };
                    }

                    const result = this.tools.executeCode(parsed.data.code);
                    return {
                        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                    };
                }

                case 'spawn_implementation_agent': {
                    const parsed = SpawnImplementationAgentSchema.safeParse(args);
                    if (!parsed.success) {
                        return {
                            content: [{ type: 'text', text: `Invalid arguments: ${parsed.error.message}` }],
                            isError: true
                        };
                    }

                    try {
                        const result = await this.implementationAgent.implement(
                            parsed.data.task,
                            parsed.data.targetFile,
                            parsed.data.className,
                            parsed.data.context
                        );
                        return {
                            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                        };
                    } catch (error: any) {
                        return {
                            content: [{ type: 'text', text: `Implementation failed: ${error.message}` }],
                            isError: true
                        };
                    }
                }

                default:
                    return {
                        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                        isError: true
                    };
            }
        });
    }

    /**
     * Start the MCP server with stdio transport.
     */
    async start(): Promise<void> {
        Logger.info('MCPServer', 'Starting MCP server');
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        Logger.info('MCPServer', 'MCP server started');
    }

    /**
     * Close the MCP server.
     */
    async close(): Promise<void> {
        Logger.info('MCPServer', 'Closing MCP server');
        await this.server.close();
    }
}
