import * as fs from 'fs';
import * as path from 'path';

/**
 * Loads a prompt template from the prompts directory.
 */
export function loadPrompt(promptName: string): string {
    const promptPath = path.join(__dirname, '..', '..', 'prompts', `${promptName}.md`);

    if (fs.existsSync(promptPath)) {
        return fs.readFileSync(promptPath, 'utf8');
    }

    throw new Error(`Prompt file not found: ${promptPath}`);
}

/**
 * Loads the planning agent system prompt.
 */
export function loadPlanningAgentPrompt(): string {
    return loadPrompt('planning-agent');
}

/**
 * Loads the implementation instructions template.
 */
export function loadImplementationInstructionsTemplate(): string {
    return loadPrompt('implementation-instructions');
}

/**
 * Loads the node refinement prompt for AI-powered node tweaking.
 */
export function loadNodeRefinementPrompt(): string {
    return loadPrompt('node-refinement');
}

/**
 * Loads the implementation agent prompt for single-class implementation.
 */
export function loadImplementationAgentPrompt(): string {
    return loadPrompt('implementation-agent');
}

/**
 * Fills in template placeholders with actual values.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(values)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
}
