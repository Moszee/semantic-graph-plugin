import { h } from 'preact';

interface FieldGroupViewProps {
    label: string;
    children: any;
}

export function FieldGroupView({ label, children }: FieldGroupViewProps) {
    return (
        <div className="field-group">
            <div className="field-label">{label}</div>
            {children}
        </div>
    );
}
