// Paperwell işareti: köşesi kıvrık sayfa + "well" dalgası
export default function Logo({ className = 'w-7 h-7' }) {
    return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
            <defs>
                <linearGradient id="pw-g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#4f46e5" />
                    <stop offset="1" stopColor="#0ea5e9" />
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#pw-g)" />
            <path d="M10 7.5h8.5l4.5 4.5v12.5a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" fill="#fff" />
            <path d="M18.5 7.5V11a1 1 0 0 0 1 1H23" fill="#c7d2fe" />
            <path d="M11.5 19.2c1.2-1.2 2.3-1.2 3.5 0s2.3 1.2 3.5 0 2.3-1.2 3.5 0" fill="none" stroke="#4f46e5" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M11.5 22.2c1.2-1.2 2.3-1.2 3.5 0s2.3 1.2 3.5 0" fill="none" stroke="#0ea5e9" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}
