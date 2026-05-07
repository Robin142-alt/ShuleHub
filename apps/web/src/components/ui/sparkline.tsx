export function Sparkline({
  values,
  colorClass,
}: {
  values: number[];
  colorClass: string;
}) {
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  // Create area fill path
  const areaPoints = `0,100 ${points} 100,100`;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`h-10 w-full ${colorClass}`}
      aria-hidden="true"
    >
      {/* Fill area */}
      <polygon
        fill="currentColor"
        opacity="0.08"
        points={areaPoints}
      />
      {/* Line */}
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
