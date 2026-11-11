// PDF form alanlarını doldurulabilir girişler olarak gösterir (Acrobat "Doldur ve İmzala" gibi)
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { readPageFields } from '../../core/forms';

const fieldBg = 'color-mix(in srgb, var(--accent) 9%, transparent)';

export default function FormLayer({ index, interactive }) {
    const { state, dispatch } = useEditor();
    const [fields, setFields] = useState([]);
    useEffect(() => {
        let alive = true;
        readPageFields(state.doc.bytes, index).then((f) => alive && setFields(f));
        return () => { alive = false; };
    }, [state.doc.bytes, index]);

    if (!fields.length) return null;
    const values = state.forms.values;
    const valueOf = (f) => (f.name in values ? values[f.name] : f.value);
    const set = (name, value) => dispatch({ type: 'SET_FORM', name, value });
    const pe = interactive ? 'auto' : 'none';

    return (
        <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
            {fields.map((f) => {
                const style = { position: 'absolute', left: f.x, top: f.y, width: f.w, height: f.h, pointerEvents: f.readOnly ? 'none' : pe };
                const fontSize = f.fontSize || Math.max(7, Math.min(13, f.h * (f.multiline ? 0.28 : 0.62)));
                const common = 'outline-none rounded-[2px] focus:ring-2 focus:ring-[var(--accent)] text-[#111]';
                if (f.kind === 'text') {
                    const v = valueOf(f) ?? '';
                    const props = {
                        value: typeof v === 'string' ? v : '',
                        maxLength: f.maxLen,
                        title: f.label,
                        'aria-label': f.label,
                        onChange: (e) => set(f.name, e.target.value),
                        onKeyDown: (e) => e.stopPropagation(),
                        className: common,
                        style: { ...style, fontSize, padding: '0 2px', textAlign: f.align, background: fieldBg, border: 'none', fontFamily: 'Liberation Sans, Arial, sans-serif', resize: 'none', lineHeight: 1.2 },
                    };
                    return f.multiline ? <textarea key={f.id} {...props} /> : <input key={f.id} type="text" {...props} />;
                }
                if (f.kind === 'checkbox') {
                    const v = valueOf(f);
                    const on = v === true || (typeof v === 'string' && v !== 'Off' && v !== '');
                    return (
                        <button key={f.id} type="button" role="checkbox" aria-checked={on} aria-label={f.label} title={f.label}
                            onClick={() => set(f.name, !on)} className={`${common} flex items-center justify-center`}
                            style={{ ...style, background: fieldBg, border: '1px solid rgba(0,0,0,.35)' }}>
                            {on && <Check style={{ width: f.w * 0.8, height: f.h * 0.8 }} strokeWidth={3} />}
                        </button>
                    );
                }
                if (f.kind === 'radio') {
                    const on = valueOf(f) === f.exportValue;
                    return (
                        <button key={f.id} type="button" role="radio" aria-checked={on} aria-label={`${f.label}: ${f.exportValue}`} title={f.exportValue}
                            onClick={() => set(f.name, f.exportValue)} className={`${common} flex items-center justify-center rounded-full`}
                            style={{ ...style, background: fieldBg, border: '1px solid rgba(0,0,0,.35)', borderRadius: '50%' }}>
                            {on && <span className="rounded-full bg-[#111]" style={{ width: f.w * 0.5, height: f.h * 0.5 }} />}
                        </button>
                    );
                }
                const v = valueOf(f);
                return (
                    <select key={f.id} value={Array.isArray(v) ? v[0] : (v ?? '')} aria-label={f.label} title={f.label}
                        onChange={(e) => set(f.name, e.target.value)} onKeyDown={(e) => e.stopPropagation()} className={common}
                        style={{ ...style, fontSize, background: fieldBg, border: 'none', padding: '0 2px' }}>
                        <option value="" />
                        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                );
            })}
        </div>
    );
}
