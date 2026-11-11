import { Spinner } from '../components/ui';

export default function BusyOverlay({ busy }) {
    const pct = typeof busy.progress === 'number' ? Math.round(busy.progress * 100) : null;
    return (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/10 backdrop-blur-[1px] cursor-wait" aria-live="polite" aria-busy="true">
            <div className="min-w-[220px] rounded-2xl bg-surface border border-line shadow-float px-5 py-4 flex flex-col gap-3 animate-[popIn_.12s_ease-out]">
                <div className="flex items-center gap-3 text-[13px] font-medium">
                    <Spinner className="w-4 h-4 text-accent" />
                    {busy.label}
                </div>
                {pct !== null && (
                    <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                        <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
                    </div>
                )}
            </div>
        </div>
    );
}
