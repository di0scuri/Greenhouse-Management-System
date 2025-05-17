
'use client'; 

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


export interface NpkDataPoint {
  name: string; 
  n: number; 
  p: number;
  k: number;
}

interface NpkChartProps {
  data: NpkDataPoint[]; 
}

const NpkChart: React.FC<NpkChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className="text-center text-gray-500">No NPK data available to display.</p>;
  }

  return (

    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{
          top: 20,
          right: 30,
          left: 0, 
          bottom: 5,
        }}
      >

        <CartesianGrid strokeDasharray="3 3" vertical={false} />

        <XAxis dataKey="name" tick={{ fontSize: 12 }} />

        <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />

        <Tooltip
          contentStyle={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.375rem' }}
          labelStyle={{ fontWeight: 'bold', color: '#1f2937' }}
        />

        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />

        <Bar dataKey="n" name="Nitrogen" fill="#4ade80" radius={[4, 4, 0, 0]} /> {/* Green */}

        <Bar dataKey="p" name="Phosphorus" fill="#a7f3d0" radius={[4, 4, 0, 0]} /> {/* Lighter Green */}

        <Bar dataKey="k" name="Potassium" fill="#facc15" radius={[4, 4, 0, 0]} /> {/* Yellow */}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default NpkChart;
