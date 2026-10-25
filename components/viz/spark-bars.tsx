import React from 'react';

/**
 * KPI sparkline in the reference style: hairline columns in a recessive grey with
 * the latest period in the accent. Single series, so no legend; each column has a
 * native tooltip, and the KPI value beside it carries the number.
 */
export function SparkBars({
  values,
  format,
  tone = 'good',
  height = 34,
  label,
}: {
  values: number[];
  format: (v: number) => string;
  tone?: 'good' | 'bad';
  height?: number;
  label: string;
}) {
  if (values.length === 0) return <div style={{ height }} className="w-16" aria-hidden="true" />;
  const max = Math.max(...values, 1e-9);
  const step = 5;
  const width = values.length * step;
  return (
    <svg width={width} height={height} role="img" aria-label={label} className="overflow-visible">
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * (height - 2));
        const last = i === values.length - 1;
        return (
          <rect
            key={i}
            x={i * step}
            y={height - h}
            width={2}
            height={h}
            rx={1}
            className={last ? (tone === 'good' ? 'fill-good' : 'fill-bad') : 'fill-mark-muted'}
          >
            <title>{format(v)}</title>
          </rect>
        );
      })}
    </svg>
  );
}
