// src/components/NpkChart.tsx
'use client'; // Recharts often requires client-side rendering

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Define the structure of the data expected by the chart
export interface NpkDataPoint {
  name: string; // Plant name or identifier
  n: number;    // Nitrogen level (e.g., percentage)
  p: number;    // Phosphorus level
  k: number;    // Potassium level
}

interface NpkChartProps {
  data: NpkDataPoint[]; // Array of data points
}

const NpkChart: React.FC<NpkChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className="text-center text-gray-500">No NPK data available to display.</p>;
  }

  return (
    // Responsive container ensures the chart adjusts to its parent container size
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{
          top: 20,
          right: 30,
          left: 0, // Adjusted left margin
          bottom: 5,
        }}
      >
        {/* Grid lines for better readability */}
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        {/* X-axis representing plant names */}
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        {/* Y-axis representing NPK levels (assuming percentage) */}
        <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
        {/* Tooltip shows values on hover */}
        <Tooltip
          contentStyle={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.375rem' }}
          labelStyle={{ fontWeight: 'bold', color: '#1f2937' }}
        />
        {/* Legend to identify the bars */}
        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
        {/* Bar for Nitrogen */}
        <Bar dataKey="n" name="Nitrogen" fill="#4ade80" radius={[4, 4, 0, 0]} /> {/* Green */}
        {/* Bar for Phosphorus */}
        <Bar dataKey="p" name="Phosphorus" fill="#a7f3d0" radius={[4, 4, 0, 0]} /> {/* Lighter Green */}
        {/* Bar for Potassium */}
        <Bar dataKey="k" name="Potassium" fill="#facc15" radius={[4, 4, 0, 0]} /> {/* Yellow */}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default NpkChart;
