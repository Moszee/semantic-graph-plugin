import { IHtmlComponent } from './HtmlComponent';

/**
 * Empty state component displayed when no nodes exist
 */
export class EmptyStateComponent implements IHtmlComponent {
    constructor(
        private title: string = "No nodes yet",
        private message: string = "Create a .intent-graph/nodes directory with YAML files to get started."
    ) { }

    render(): string {
        return `
            <div class="empty-state">
                <h2>${this.title}</h2>
                <p>${this.message}</p>
            </div>
        `;
    }
}
