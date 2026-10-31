import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function AttendanceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      <span>{payload[0].value.toLocaleString()} students</span>
    </div>
  );
}

export default function AttendanceChart({ data }) {
  return (
    <section className="panel attendance-panel">
      <div className="panel-heading">
        <div>
          <h2>Attendance distribution</h2>
          <p>Dataset student count by attendance range</p>
        </div>
      </div>
      <div className="attendance-chart" role="img" aria-label="Student counts grouped by attendance range">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#ecebe5" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8a96a8', fontSize: 12 }}
              dy={10}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8a96a8', fontSize: 12 }}
              tickFormatter={(value) => value.toLocaleString()}
            />
            <Tooltip content={<AttendanceTooltip />} cursor={{ fill: '#edf2ee' }} />
            <Bar dataKey="students" fill="#527b78" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
