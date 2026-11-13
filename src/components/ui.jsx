// Ortak arayüz parçaları
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { useBrandKit } from '../core/brandKit';

export const cx = (...a) => a.filter(Boolean).join(' ');

export function Button({ variant = 'default', size = 'md', icon: Icon, children, className, ...props }) {
    const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-45 disabled:pointer-events-none select-none whitespace-nowrap';
    const sizes = { sm: 'h-8 px-2.5 text-[13px]', md: 'h-9 px-3.5 text-[13px]', lg: 'h-11 px-5 text-sm' };
    const variants = {
        default: 'bg-surface border border-line hover:bg-surface-2 hover:border-line-strong text-fg shadow-soft',
        primary: 'bg-accent text-white hover:bg-accent-hover shadow-soft',
        ghost: 'text-fg-2 hover:bg-surface-3 hover:text-fg',
        danger: 'bg-danger text-white hover:brightness-110 shadow-soft',
        soft: 'bg-accent-soft text-accent-text hover:brightness-95',
    };
    return (
        <button type="button" className={cx(base, sizes[size], variants[variant], className)} {...props}>
            {Icon && <Icon className="w-4 h-4 shrink-0" />}
            {children}
        </button>
    );
}

export function IconButton({ icon: Icon, label, active, size = 'md', className, shortcut, tooltipSide = 'bottom', ...props }) {
    const sizes = { sm: 'w-7 h-7', md: 'w-8 h-8', lg: 'w-9 h-9' };
    return (
        <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
            <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                className={cx(
                    'inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-35 disabled:pointer-events-none',
                    sizes[size],
                    active ? 'bg-accent-soft text-accent-text' : 'text-fg-2 hover:bg-surface-3 hover:text-fg',
                    className,
                )}
                {...props}
            >
                <Icon className="w-[18px] h-[18px]" />
            </button>
        </Tooltip>
    );
}

export function Kbd({ children }) {
    return <kbd className="px-1.5 py-0.5 rounded-md border border-line bg-surface-2 text-[11px] font-mono text-fg-2">{children}</kbd>;
}

/** Hafif ipucu: hover/focus sonrası küçük gecikmeyle görünür */
export function Tooltip({ label, shortcut, side = 'bottom', children }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const ref = useRef(null);
    const timer = useRef();

    const show = () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            const r = ref.current?.firstElementChild?.getBoundingClientRect();
            if (r) setPos(r);
            setOpen(true);
        }, 350);
    };
    const hide = () => { clearTimeout(timer.current); setOpen(false); };
    useEffect(() => () => clearTimeout(timer.current), []);

    if (!label) return children;
    let style = {};
    if (pos) {
        if (side === 'right') style = { left: pos.right + 8, top: pos.top + pos.height / 2, transform: 'translateY(-50%)' };
        else if (side === 'top') style = { left: pos.left + pos.width / 2, top: pos.top - 8, transform: 'translate(-50%, -100%)' };
        else style = { left: pos.left + pos.width / 2, top: pos.bottom + 8, transform: 'translateX(-50%)' };
    }
    return (
        <span ref={ref} className="contents" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onMouseDown={hide}>
            {children}
            {open && pos && createPortal(
                <div className="fixed z-[200] pointer-events-none px-2 py-1 rounded-md bg-[#18181d] text-white text-xs shadow-float flex items-center gap-2 whitespace-nowrap" style={style}>
                    {label}
                    {shortcut && <span className="text-white/55 font-mono text-[11px]">{shortcut}</span>}
                </div>,
                document.body,
            )}
        </span>
    );
}

export function Slider({ value, min, max, step = 1, onChange, onCommit, onStart, label, unit = '', format }) {
    const pct = ((value - min) / (max - min)) * 100;
    return (
        <label className="block">
            {label && (
                <span className="flex justify-between text-xs text-fg-2 mb-2">
                    <span>{label}</span>
                    <span className="tabular-nums text-fg">{format ? format(value) : `${Math.round(value * 100) / 100}${unit}`}</span>
                </span>
            )}
            <input
                type="range"
                className="slider"
                min={min}
                max={max}
                step={step}
                value={value}
                style={{ '--pct': `${pct}%` }}
                onChange={(e) => onChange(Number(e.target.value))}
                onPointerDown={() => onStart?.()}
                onPointerUp={() => onCommit?.()}
                onKeyUp={() => onCommit?.()}
            />
        </label>
    );
}

export function Segmented({ value, onChange, options, className }) {
    return (
        <div className={cx('flex p-0.5 rounded-lg bg-surface-3 gap-0.5', className)} role="radiogroup">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    title={o.title}
                    onClick={() => onChange(o.value)}
                    className={cx(
                        'flex-1 h-7 px-2 rounded-md text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors',
                        value === o.value ? 'bg-surface text-fg shadow-soft' : 'text-fg-2 hover:text-fg',
                    )}
                >
                    {o.icon && <o.icon className="w-3.5 h-3.5" />}
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export const SWATCHES = ['#111827', '#ffffff', '#6b7280', '#e11d48', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#2563eb', '#7c3aed', '#db2777', '#92400e'];

export function ColorPicker({ value, onChange, allowNone, swatches }) {
    const { colors } = useBrandKit();
    // Varsayılan renk listesinin başında marka renkleri gelir
    if (!swatches) swatches = [...new Set([...colors.map((c) => c.hex.toLowerCase()), ...SWATCHES])].slice(0, 14);
    return (
        <div className="flex flex-wrap gap-1.5 items-center">
            {allowNone && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    aria-label="—"
                    className={cx('w-6 h-6 rounded-full border border-line-strong relative overflow-hidden', !value && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')}
                >
                    <span className="absolute inset-0 m-auto w-[140%] h-[1.5px] bg-danger rotate-45 -translate-x-[15%]" />
                </button>
            )}
            {swatches.map((c) => (
                <button
                    key={c}
                    type="button"
                    onClick={() => onChange(c)}
                    aria-label={c}
                    className={cx('w-6 h-6 rounded-full border border-black/10 transition-transform hover:scale-110', value?.toLowerCase() === c && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')}
                    style={{ background: c }}
                />
            ))}
            <label className="w-6 h-6 rounded-full border border-line-strong overflow-hidden cursor-pointer relative" title="Özel renk" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
                <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
        </div>
    );
}

export function Field({ label, children, hint }) {
    return (
        <div className="space-y-2">
            {label && <div className="text-xs font-medium text-fg-2">{label}</div>}
            {children}
            {hint && <p className="text-xs text-fg-3 leading-relaxed">{hint}</p>}
        </div>
    );
}

export function Toggle({ checked, onChange, label }) {
    return (
        <label className="flex items-center justify-between gap-3 cursor-pointer select-none text-[13px]">
            <span>{label}</span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={cx('w-9 h-5 rounded-full relative transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
            >
                <span className={cx('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
            </button>
        </label>
    );
}

export function Dialog({ open, onClose, title, description, children, footer, width = 520 }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, onClose]);
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" aria-label={title} className="bg-surface border border-line rounded-2xl shadow-float w-full max-h-[90vh] flex flex-col" style={{ maxWidth: width }}>
                <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
                    <div>
                        <h2 className="text-base font-semibold">{title}</h2>
                        {description && <p className="text-[13px] text-fg-2 mt-1 leading-relaxed">{description}</p>}
                    </div>
                    <IconButton icon={X} label="Kapat" onClick={onClose} size="sm" />
                </div>
                <div className="px-6 pb-5 overflow-y-auto scroll-thin">{children}</div>
                {footer && <div className="px-6 py-4 border-t border-line flex justify-end gap-2 bg-surface-2 rounded-b-2xl">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
}

/** Açılır menü */
export function Menu({ trigger, items, align = 'left' }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const [pos, setPos] = useState(null);

    useLayoutEffect(() => {
        if (!open || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        setPos(align === 'right' ? { top: r.bottom + 6, right: window.innerWidth - r.right } : { top: r.bottom + 6, left: r.left });
    }, [open, align]);

    useEffect(() => {
        if (!open) return;
        const close = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.('[data-menu]')) setOpen(false); };
        const esc = (e) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('pointerdown', close);
        window.addEventListener('keydown', esc);
        return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
    }, [open]);

    return (
        <>
            <span ref={ref} className="inline-flex" onClick={() => setOpen((o) => !o)}>{trigger}</span>
            {open && pos && createPortal(
                <div data-menu className="fixed z-[160] min-w-[220px] py-1.5 rounded-xl border border-line bg-surface shadow-float" style={pos}>
                    {items.map((it, i) => it === '-' ? (
                        <div key={i} className="my-1.5 h-px bg-line" />
                    ) : it.header ? (
                        <div key={i} className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">{it.header}</div>
                    ) : (
                        <button
                            key={i}
                            type="button"
                            disabled={it.disabled}
                            onClick={() => { setOpen(false); it.onClick?.(); }}
                            className="w-full flex items-center gap-2.5 px-3 h-8 text-[13px] text-left hover:bg-surface-3 disabled:opacity-40"
                        >
                            {it.icon ? <it.icon className="w-4 h-4 text-fg-2" /> : <span className="w-4" />}
                            <span className="flex-1">{it.label}</span>
                            {it.checked && <Check className="w-4 h-4 text-accent" />}
                            {it.shortcut && <span className="text-[11px] text-fg-3 font-mono">{it.shortcut}</span>}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    );
}

export function Spinner({ className = 'w-4 h-4' }) {
    return <span className={cx('inline-block rounded-full border-2 border-current border-t-transparent animate-spin', className)} />;
}
