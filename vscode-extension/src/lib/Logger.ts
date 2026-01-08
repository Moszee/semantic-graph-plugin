import * as vscode from 'vscode';

/**
 * Centralized logger for the Intent Graph extension.
 * Uses VSCode's OutputChannel to provide visible logs in the Output panel.
 */
export class Logger {
    private static channel: vscode.OutputChannel | null = null;
    private static isVerbose: boolean = false;

    /**
     * Initialize the logger. Must be called during extension activation.
     */
    static initialize(context: vscode.ExtensionContext): void {
        this.channel = vscode.window.createOutputChannel('Intent Graph');
        context.subscriptions.push(this.channel);
        this.updateVerboseSetting();

        // Watch for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('intentGraph.verboseLogging')) {
                    this.updateVerboseSetting();
                }
            })
        );
    }

    /**
     * Update the verbose logging setting from configuration.
     */
    private static updateVerboseSetting(): void {
        const config = vscode.workspace.getConfiguration('intentGraph');
        this.isVerbose = config.get<boolean>('verboseLogging') ?? false;
    }

    /**
     * Format a log message with timestamp and category.
     */
    private static formatMessage(level: string, category: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] [${category}] ${message}`;
    }

    /**
     * Format optional data for logging.
     */
    private static formatData(data: unknown): string {
        if (data === undefined) {
            return '';
        }
        try {
            const formatted = JSON.stringify(data, null, 2);
            return `\n${formatted}`;
        } catch {
            return `\n[Unable to serialize data: ${typeof data}]`;
        }
    }

    /**
     * Log a debug message. Only shown when verbose logging is enabled.
     */
    static debug(category: string, message: string, data?: unknown): void {
        if (!this.isVerbose) {
            return;
        }
        const formatted = this.formatMessage('DEBUG', category, message) + this.formatData(data);
        this.channel?.appendLine(formatted);
        console.log(formatted);
    }

    /**
     * Log an info message. Always shown.
     */
    static info(category: string, message: string, data?: unknown): void {
        const formatted = this.formatMessage('INFO', category, message) + this.formatData(data);
        this.channel?.appendLine(formatted);
        console.log(formatted);
    }

    /**
     * Log a warning message. Always shown.
     */
    static warn(category: string, message: string, data?: unknown): void {
        const formatted = this.formatMessage('WARN', category, message) + this.formatData(data);
        this.channel?.appendLine(formatted);
        console.warn(formatted);
    }

    /**
     * Log an error message. Always shown.
     */
    static error(category: string, message: string, error?: unknown): void {
        let errorDetails = '';
        if (error !== undefined) {
            if (error instanceof Error) {
                errorDetails = `\nError: ${error.message}\nStack: ${error.stack}`;
            } else {
                errorDetails = this.formatData(error);
            }
        }
        const formatted = this.formatMessage('ERROR', category, message) + errorDetails;
        this.channel?.appendLine(formatted);
        console.error(formatted);
    }

    /**
     * Show the output channel to the user.
     */
    static show(): void {
        this.channel?.show();
    }
}
