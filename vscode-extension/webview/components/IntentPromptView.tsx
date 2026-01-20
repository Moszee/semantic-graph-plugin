import { h, JSX } from 'preact';

interface IntentPromptViewProps {
    intentName: string;
    value: string;
    isLoading: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onKeyDown: JSX.KeyboardEventHandler<HTMLTextAreaElement>;
}

export function IntentPromptView({
    intentName,
    value,
    isLoading,
    onChange,
    onSubmit,
    onKeyDown,
}: IntentPromptViewProps) {
    return (
        <div class="intent-prompt-panel">
            <div class="intent-prompt-header">
                <h3>Refine Intent: {intentName}</h3>
            </div>
            <div class="intent-prompt-content">
                <p class="intent-prompt-description">
                    Describe changes you want to make to the entire intent. The AI can add, update, or remove nodes.
                </p>
                <textarea
                    class="ai-prompt-textarea"
                    placeholder="e.g., Add error handling nodes, connect the output to a notification service..."
                    rows={4}
                    value={value}
                    onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
                    onKeyDown={onKeyDown}
                    disabled={isLoading}
                />
                <div class="ai-prompt-actions">
                    <span class="ai-prompt-hint">Ctrl+Enter to send</span>
                    <button class="ai-prompt-send-btn" onClick={onSubmit} disabled={isLoading}>
                        Refine Intent
                    </button>
                </div>
                {isLoading && (
                    <div class="ai-prompt-loading">
                        <div class="spinner"></div>
                        <span>AI is processing...</span>
                    </div>
                )}
            </div>
        </div>
    );
}
