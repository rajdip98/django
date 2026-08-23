/** The club emblem, drawn inline so it needs no network request. */
export default function Emblem({ size = 64, className = 'emblem' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64"
         role="img" aria-label="Club emblem">
      <circle cx="32" cy="32" r="30" fill="#0b2545" stroke="#b8860b" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="23" fill="none" stroke="#e8c565" strokeWidth="1" />
      <path d="M32 13l4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3L32 36.6l-9.3 4.9 1.8-10.3-7.5-7.3 10.4-1.5z"
            fill="#e8c565" />
      <path d="M20 45c4 4 8 6 12 6s8-2 12-6" fill="none" stroke="#e8c565"
            strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
