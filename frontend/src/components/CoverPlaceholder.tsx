export function CoverPlaceholder({
  fontSize = 13,
  iconSize = 36,
}: {
  fontSize?: number;
  iconSize?: number;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        background: 'linear-gradient(135deg, #f5f6fa 0%, #eef0f5 100%)',
        color: '#b2bec3',
      }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
      <span style={{ fontSize, fontWeight: 500, letterSpacing: 1 }}>
        暂无封面
      </span>
    </div>
  );
}
