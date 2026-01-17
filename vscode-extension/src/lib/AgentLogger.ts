import * as vscode from 'vscode';

/**
 * Type of agent log entry.
 */
export type AgentLogType = 'tool_call' | 'prompt_sent' | 'response_received' | 'error';

/**
 * Represents a single log entry from the agent.
 */
export interface AgentLogEntry {
    timestamp: number;
    type: AgentLogType;
    message: string;
    details?: unknown;
}

/**
 * Logger for agent activity. Stores recent entries for UI display
 * and logs full details to the debug console.
 */
export class AgentLogger {
    private static instance: AgentLogger | undefined;
    private logs: AgentLogEntry[] = [];
    private readonly maxLogs = 100;
    private readonly _onLogAdded = new vscode.EventEmitter<AgentLogEntry>();
    public readonly onLogAdded = this._onLogAdded.event;

    private constructor() { }

    /**
     * Get the singleton instance.
     */
    public static getInstance(): AgentLogger {
        if (!AgentLogger.instance) {
            AgentLogger.instance = new AgentLogger();
        }
        return AgentLogger.instance;
    }

    /**
     * Log an agent activity.
     * Brief message goes to UI, full details go to console.
     */
    public log(type: AgentLogType, message: string, details?: unknown): void {
        const entry: AgentLogEntry = {
            timestamp: Date.now(),
            type,
            message,
            details
        };

        // Add to circular buffer
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Log full details to debug console
        const typeLabel = type.toUpperCase().replace('_', ' ');
        console.debug(`[AgentLogger] [${typeLabel}] ${message}`, details ?? '');

        // Emit event for UI updates
        this._onLogAdded.fire(entry);
    }

    /**
     * Log a tool call from the agent.
     */
    public logToolCall(toolName: string, args: Record<string, unknown>): void {
        const argsPreview = Object.entries(args)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(', ');
        const message = `${toolName}(${argsPreview})`;
        this.log('tool_call', message, { toolName, args });
    }

    /**
     * Log when a prompt is sent to the AI.
     */
    public logPromptSent(promptName: string, context?: Record<string, unknown>): void {
        this.log('prompt_sent', promptName, context);
    }

    /**
     * Log when a response is received from the AI.
     */
    public logResponseReceived(summary: string, fullResponse?: unknown): void {
        this.log('response_received', summary, fullResponse);
    }

    /**
     * Log an error.
     */
    public logError(message: string, error?: unknown): void {
        this.log('error', message, error);
    }

    /**
     * Get recent log entries for UI display.
     */
    public getRecentLogs(count?: number): AgentLogEntry[] {
        const n = count ?? this.maxLogs;
        return this.logs.slice(-n);
    }

    /**
     * Clear all logs.
     */
    public clear(): void {
        this.logs = [];
    }
}
