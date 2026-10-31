import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

function RiskTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <strong>{payload[0].name}</strong>
      <span>{payload[0].value.toLocaleString()} students</span>
    </div>
  );
}

export default function RiskDistributionCard({ data }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <section className="panel risk-panel">
      <div className="panel-heading">
        <div>
          <h2>Risk distribution</h2>
          <p>Existing categories in the dataset</p>
        </div>
      </div>
      <div className="risk-content">
        <div className="risk-chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={61} outerRadius={83} paddingAngle={3} stroke="none">
                {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip content={<RiskTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="risk-chart-center">
            <strong>{total.toLocaleString()}</strong>
            <span>students</span>
          </div>
        </div>
        <ul className="risk-legend">
          {data.map((item) => (
            <li key={item.name}>
              <span className="legend-label"><i style={{ backgroundColor: item.color }} />{item.name}</span>
              <strong>{item.value.toLocaleString()}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
