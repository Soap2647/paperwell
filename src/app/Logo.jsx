export default function Logo({ className = 'w-7 h-7' }) {
    return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
            <defs>
                <linearGradient id="nb-g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#6d6dfa" />
                    <stop offset="1" stopColor="#b44cf0" />
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#nb-g)" />
            <path d="M10 22V10l12 12V10" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="23.5" cy="8.5" r="2" fill="#fff" opacity=".85" />
        </svg>
    );
}
