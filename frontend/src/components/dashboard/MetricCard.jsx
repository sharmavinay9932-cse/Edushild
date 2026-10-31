import React from 'react';
import { Users, ShieldAlert, ChartNoAxesColumn, HeartHandshake } from 'lucide-react';

const icons = [Users, ShieldAlert, ChartNoAxesColumn, HeartHandshake];
const iconStyles = ['blue', 'red', 'amber', 'green'];

export default function MetricCard({ metric, index }) {
  const Icon = icons[index];

  return (
    <article className="metric-card">
      <div className={`metric-icon metric-icon-${iconStyles[index]}`}>
        <Icon size={19} strokeWidth={2} aria-hidden="true" />
      </div>
      <div className="metric-heading">
        <span>{metric.label}</span>
      </div>
      <div className="metric-value">{metric.value}</div>
    </article>
  );
}
