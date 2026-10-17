type InvestmentHistoryPoint = {
  recordedAt: string;
  balanceUsd: string;
};

export function InvestmentHistoryChart({
  history,
  currentUsd,
}: {
  history: InvestmentHistoryPoint[];
  currentUsd: string;
}) {
  const values =
    history.length > 0
      ? history.map((point) => Number(point.balanceUsd))
      : [Number(currentUsd)];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  const path = values
    .map((value, index) => {
      const x = values.length === 1 ? 4 : 4 + (index / (values.length - 1)) * 232;
      const y = range === 0 ? 30 : 54 - ((value - minimum) / range) * 48;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = values[values.length - 1] >= values[0];

  return (
    <svg
      className={`investment-history-chart${rising ? " rising" : " falling"}`}
      viewBox="0 0 240 60"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Investment balance history. Current value $${Number(currentUsd).toFixed(2)}.`}
    >
      {[12, 30, 48].map((y) => (
        <line
          key={y}
          x1="0"
          x2="240"
          y1={y}
          y2={y}
          className="investment-history-gridline"
        />
      ))}
      <path
        d={path}
        fill="none"
        className="investment-history-line"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={values.length === 1 ? 4 : 236}
        cy={
          range === 0
            ? 30
            : 54 -
              ((values[values.length - 1] - minimum) / range) * 48
        }
        r="2.5"
        className="investment-history-point"
      />
      <title>
        {history.length
          ? `${history.length} recorded balance points`
          : "Starting balance"}
      </title>
    </svg>
  );
}
