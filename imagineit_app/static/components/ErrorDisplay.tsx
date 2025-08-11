
import React from 'react';

interface ErrorDisplayProps {
    error: string;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error }) => {
  return (
    <div className="bg-red-900/50 border border-red-500 text-red-300 px-6 py-4 rounded-lg relative max-w-lg text-center" role="alert">
        <strong className="font-bold text-lg block mb-2">Oops! Something went wrong.</strong>
        <span className="block sm:inline">{error}</span>
    </div>
  );
};

export default ErrorDisplay;
