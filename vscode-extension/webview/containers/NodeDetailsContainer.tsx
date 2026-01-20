import { h } from 'preact';
import { IntentNode } from '../types';
import { NodeDetailsView } from '../components/NodeDetailsView';
import { postVSCodeMessage } from '../hooks/useVSCodeMessage';

interface NodeDetailsContainerProps {
    node: IntentNode;
    isEditable: boolean;
    aiPrompt: string;
    isAiLoading: boolean;
    onAiPromptChange: (value: string) => void;
    onAiLoadingChange: (value: boolean) => void;
}

export function NodeDetailsContainer({
    node,
    isEditable,
    aiPrompt,
    isAiLoading,
    onAiPromptChange,
    onAiLoadingChange,
}: NodeDetailsContainerProps) {
    const handleAIPromptChange = (value: string) => {
        onAiPromptChange(value);
    };

    const handleAISubmit = () => {
        if (!aiPrompt.trim()) return;

        onAiLoadingChange(true);
        postVSCodeMessage({
            command: 'tweakNode',
            nodeId: node.id,
            prompt: aiPrompt,
        });

        // Clear loading state after 2 seconds
        // TODO: Listen for response from extension to clear properly
        setTimeout(() => {
            onAiLoadingChange(false);
            onAiPromptChange('');
        }, 2000);
    };

    const handleAIKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            handleAISubmit();
        }
    };

    const handleFieldUpdate = (field: string, value: string) => {
        postVSCodeMessage({
            command: 'updateNode',
            nodeId: node.id,
            field,
            value,
        });
    };

    return (
        <NodeDetailsView
            node={node}
            isEditable={isEditable}
            aiPrompt={aiPrompt}
            isLoading={isAiLoading}
            onAIPromptChange={handleAIPromptChange}
            onAISubmit={handleAISubmit}
            onAIKeyDown={handleAIKeyDown}
            onFieldUpdate={handleFieldUpdate}
        />
    );
}
