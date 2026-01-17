/**
 * Base interface for all HTML components
 */
export interface IHtmlComponent {
    render(): string;
}

/**
 * Utility class for building HTML safely
 */
export class HtmlBuilder {
    /**
     * Escapes HTML entities to prevent XSS
     */
    static escapeHtml(text: string): string {
        const escapeMap: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return text.replace(/[&<>"']/g, char => escapeMap[char]);
    }

    /**
     * Returns className if condition is true, empty string otherwise
     */
    static conditionalClass(condition: boolean, className: string): string {
        return condition ? className : '';
    }

    /**
     * Builds an HTML element with attributes and content
     */
    static element(tag: string, attrs: Record<string, string>, content: string): string {
        const attrString = Object.entries(attrs)
            .map(([key, value]) => `${key}="${HtmlBuilder.escapeHtml(value)}"`)
            .join(' ');
        return `<${tag} ${attrString}>${content}</${tag}>`;
    }
}
