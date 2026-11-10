import { useRef } from 'react';
import { useEditor } from '../store/editor';
import { t } from '../i18n';
import { Tooltip, cx } from '../components/ui';
import { TOOLS } from './tools';
import { readImageFile } from './imageFiles';

export default function ToolRail() {
    const { state, dispatch } = useEditor();
    const fileRef = useRef(null);

    const pick = async (id) => {
        if (id === 'image') {
            fileRef.current?.click();
            return;
        }
        dispatch({ type: 'SET_TOOL', tool: id });
    };

    return (
        <nav className="w-[68px] shrink-0 bg-surface border-r border-line flex flex-col items-center py-2 gap-0.5 overflow-y-auto scroll-thin" aria-label="Araçlar">
            {TOOLS.map((tool, i) => {
                const active = state.tool === tool.id;
                return (
                    <div key={tool.id} className="w-full px-1.5">
                        {(i === 2 || i === 9) && <div className="h-px bg-line mx-2 my-1.5" />}
                        <Tooltip label={t(tool.hint)} shortcut={tool.key} side="right">
                            <button
                                type="button"
                                onClick={() => pick(tool.id)}
                                aria-pressed={active}
                                aria-label={t(tool.label)}
                                className={cx(
                                    'w-full h-[52px] rounded-xl flex flex-col items-center justify-center gap-1 transition-colors',
                                    active ? 'bg-accent-soft text-accent-text' : 'text-fg-2 hover:bg-surface-3 hover:text-fg',
                                )}
                            >
                                <tool.icon className="w-[19px] h-[19px]" strokeWidth={active ? 2.2 : 1.9} />
                                <span className="text-[10.5px] font-medium leading-none">{t(tool.label)}</span>
                            </button>
                        </Tooltip>
                    </div>
                );
            })}
            <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                className="hidden"
                onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const img = await readImageFile(f);
                    dispatch({ type: 'SET_TOOL', tool: 'image', pendingImage: img });
                }}
            />
        </nav>
    );
}
