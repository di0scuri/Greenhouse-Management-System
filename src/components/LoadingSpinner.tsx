// src/components/LoadingSpinner.tsx (Example location)
import React from 'react';
import { Loader2 } from 'lucide-react';

const LoadingSpinner: React.FC<{ message?: string }> = ({ message = "Loading..." }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-gray-600">
      <Loader2 className="h-12 w-12 animate-spin mb-4" />
      <p className="text-lg">{message}</p>
    </div>
  );
};

export default LoadingSpinner;
