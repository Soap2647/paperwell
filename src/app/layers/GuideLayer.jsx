import { useEffect, useRef } from 'react';
import { useEditor } from '../../store/editor';

const COLOR = 'rgba(6,182,212,0.85)';
const HIT = 9; // ekran pikseli

// Kılavuz çizgileri (sayfa birimlerinde, üst katman zoom ile ölçeklenir). Etkileşim yalnızca cetveller açıkken.
export default function GuideLayer({ page, zoom, interactive }) {
    const { state, dispatch } = useEditor();
    const guides = state.guides[page.id];
    const rootRef = useRef(null);
    const stop = useRef(null);

    useEffect(() => () => stop.current?.(), []);

    if (!guides?.length) return null;

    const startDrag = (e, g) => {
        if (!interactive || e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        const posOf = (ev) => {
            const r = rootRef.current.getBoundingClientRect();
            return g.axis === 'x' ? (ev.clientX - r.left) / zoom : (ev.clientY - r.top) / zoom;
        };
        const move = (ev) => dispatch({ type: 'MOVE_GUIDE', pageId: page.id, id: g.id, pos: posOf(ev) });
        const up = (ev) => {
            stop.current?.();
            const pos = posOf(ev);
            const max = g.axis === 'x' ? page.width : page.height;
            if (pos < 0 || pos > max || ev.target?.closest?.('[data-ruler]')) dispatch({ type: 'REMOVE_GUIDE', pageId: page.id, id: g.id });
        };
        stop.current = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            stop.current = null;
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };

    const hit = HIT / zoom, line = 1 / zoom;
    return (
        <div ref={rootRef} className="absolute inset-0" style={{ pointerEvents: 'none' }}>
            {guides.map((g) => {
                const vertical = g.axis === 'x';
                return (
                    <div
                        key={g.id}
                        onPointerDown={(e) => startDrag(e, g)}
                        onDoubleClick={() => interactive && dispatch({ type: 'REMOVE_GUIDE', pageId: page.id, id: g.id })}
                        style={{
                            position: 'absolute',
                            pointerEvents: interactive ? 'auto' : 'none',
                            cursor: vertical ? 'col-resize' : 'row-resize',
                            ...(vertical
                                ? { left: g.pos - hit / 2, top: 0, width: hit, height: page.height }
                                : { top: g.pos - hit / 2, left: 0, height: hit, width: page.width }),
                        }}
                    >
                        <div
                            style={{
                                position: 'absolute',
                                background: COLOR,
                                ...(vertical
                                    ? { left: (hit - line) / 2, top: 0, width: line, height: '100%' }
                                    : { top: (hit - line) / 2, left: 0, height: line, width: '100%' }),
                            }}
                        />
                    </div>
                );
            })}
        </div>
    );
}
