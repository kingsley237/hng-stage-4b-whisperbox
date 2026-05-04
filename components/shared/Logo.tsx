export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="url(#wb-grad)" />
      <path
        d="M16 8a5 5 0 0 0-5 5v1H9a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-2v-1a5 5 0 0 0-5-5z"
        fill="white"
        opacity="0.95"
      />
      <rect x="14.5" y="17" width="3" height="3" rx="1.5" fill="url(#wb-grad)" />
      <defs>
        <linearGradient
          id="wb-grad"
          x1="0" y1="0" x2="32" y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
    </svg>
  );
}