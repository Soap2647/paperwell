import { useEditor } from '../../store/editor';

export default function SearchLayer({ page, index }) {
    const { state } = useEditor();
    const { results, index: current } = state.search;
    return (
        <svg className="absolute inset-0 pointer-events-none" width={page.width} height={page.height} style={{ mixBlendMode: 'multiply' }}>
            {results.map((r, i) => r.pageIndex === index && (
                <rect key={i} x={r.rect.x - 1} y={r.rect.y - 1} width={r.rect.w + 2} height={r.rect.h + 2} rx={1.5} fill={i === current ? '#fb923c' : '#fde047'} opacity={i === current ? 0.75 : 0.55} />
            ))}
        </svg>
    );
}
