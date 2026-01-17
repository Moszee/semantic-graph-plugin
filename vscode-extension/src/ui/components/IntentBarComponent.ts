import { IHtmlComponent } from './HtmlComponent';

export interface GraphDelta {
    name: string;
}

/**
 * Intent bar component showing selected intent with actions
 */
export class IntentBarComponent implements IHtmlComponent {
    constructor(private intent: GraphDelta | null) { }

    render(): string {
        if (!this.intent) {
            return '';
        }

        return `
            <div class="intent-bar">
                <span class="intent-name">Intent: ${this.intent.name}</span>
                <div class="intent-actions">
                    <button class="btn btn-success" onclick="implement()">Implement</button>
                    <button class="btn btn-danger" onclick="discard()">Discard</button>
                </div>
            </div>
        `;
    }
}
