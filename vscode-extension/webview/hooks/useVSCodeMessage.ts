import { useEffect, useRef } from 'preact/hooks';

interface VSCodeAPI {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

let vscodeApi: VSCodeAPI | null = null;

export function useVSCodeMessage() {
    const apiRef = useRef<VSCodeAPI | null>(null);

    useEffect(() => {
        if (!apiRef.current) {
            try {
                // @ts-ignore
                if (window.vscode) {
                    // @ts-ignore
                    apiRef.current = window.vscode;
                } else {
                    apiRef.current = acquireVsCodeApi();
                    // @ts-ignore
                    window.vscode = apiRef.current;
                }
                vscodeApi = apiRef.current;
            } catch (e) {
                console.error('Failed to acquire VS Code API:', e);
                // Try to recover if it was already acquired but not on window
                // (This is hard, but usually one of the two above works)
            }
        }
    }, []);

    const postMessage = (message: any) => {
        if (apiRef.current) {
            apiRef.current.postMessage(message);
        } else {
            console.warn('VS Code API not available', message);
        }
    };

    return { postMessage };
}

// Non-hook version for use outside components
// Lazily initializes vscodeApi if not yet available
export function postVSCodeMessage(message: any) {
    if (!vscodeApi) {
        try {
            // @ts-ignore
            if (window.vscode) {
                // @ts-ignore
                vscodeApi = window.vscode;
            } else {
                vscodeApi = acquireVsCodeApi();
                // @ts-ignore
                window.vscode = vscodeApi;
            }
        } catch (e) {
            console.error('Failed to acquire VS Code API for postVSCodeMessage:', e);
        }
    }

    if (vscodeApi) {
        vscodeApi.postMessage(message);
    } else {
        console.warn('VS Code API not available', message);
    }
}
