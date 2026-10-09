export default function TrazzaMark({
  className = 'h-12 w-12',
}: {
  className?: string
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 110"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M50 5 94 30v50l-44 25L6 80V30Z"
        stroke="#f1f5f9"
        strokeWidth="4"
      />
      <path
        d="m23 74 17-18 13 11 24-31"
        stroke="#10b98b"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="74" r="5" fill="#f1f5f9" />
      <circle cx="77" cy="36" r="5" fill="#10b98b" />
    </svg>
  )
}