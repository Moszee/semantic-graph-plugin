import { IHtmlComponent } from './HtmlComponent';

/**
 * Toolbar component with action buttons
 */
export class ToolbarComponent implements IHtmlComponent {
    constructor(private showNewIntention: boolean = true) { }

    render(): string {
        return `
            <div class="toolbar">
                ${this.showNewIntention ? '<button class="btn btn-primary" onclick="newIntention()">+ New Intention</button>' : ''}
            </div>
        `;
    }
}
