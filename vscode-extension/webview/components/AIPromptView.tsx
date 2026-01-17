import { h, JSX } from 'preact';

interface AIPromptViewProps {
    value: string;
    isLoading: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onKeyDown: JSX.KeyboardEventHandler<HTMLTextAreaElement>;
}

export function AIPromptView({
    value,
    isLoading,
    onChange,
    onSubmit,
    onKeyDown,
}: AIPromptViewProps) {
    return (
        <div className="ai-prompt-section">
            <textarea
                class="ai-prompt-textarea"
                placeholder="Describe how you want to modify this node using AI..."
                rows={3}
                value={value}
                onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
                onKeyDown={onKeyDown}
                disabled={isLoading}
            />
            <div className="ai-prompt-actions">
                <span className="ai-prompt-hint">Ctrl+Enter to send</span>
                <button className="ai-prompt-send-btn" onClick={onSubmit} disabled={isLoading}>
                    Send to AI
                </button>
            </div>
            {isLoading && (
                <div className="ai-prompt-loading">
                    <div className="spinner"></div>
                    <span>AI is processing...</span>
                </div>
            )}
        </div>
    );
}
