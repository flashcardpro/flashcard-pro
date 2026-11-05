/**
 * The Flashcard Pro mark: a ruled index card in front of a highlighter-yellow card,
 * with its corner peeled back to show the blue answer side. Peel = reveal.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={'logo-mark ' + className} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <g transform="rotate(-11 24 24)">
        <rect x="9" y="8" width="32" height="24" rx="3" fill="#FFE14D" stroke="var(--logo-ink, #18213D)" strokeWidth="2.2" />
      </g>
      <path
        d="M7 15.5a3 3 0 0 1 3-3h28a3 3 0 0 1 3 3V30l-9 9H10a3 3 0 0 1-3-3z"
        fill="#FFFFFF"
        stroke="var(--logo-ink, #18213D)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M8.5 19h31" stroke="#E5484D" strokeWidth="2" />
      <path d="M12 24.5h20M12 29.5h14M12 34.5h10" stroke="#8FB6E3" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M41 30l-9 9v-6a3 3 0 0 1 3-3z" fill="#2B55E6" stroke="var(--logo-ink, #18213D)" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <LogoMark size={compact ? 28 : 34} />
      {!compact && (
        <span className="logo-word">
          Flashcard<span className="logo-pro">Pro</span>
        </span>
      )}
    </span>
  );
}
