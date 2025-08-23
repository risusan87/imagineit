import React from 'react';

interface LoadingSpinnerProps {
  progress?: string | null;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ progress }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-purple-400"></div>
        <p className="text-gray-300 font-medium text-lg mt-2">Generating your masterpiece...</p>
        {progress ? (
            <div className="text-purple-300 font-mono text-sm mt-2 bg-gray-900/50 px-4 py-2 rounded-md text-left max-w-md">
                {progress.split(' | ').map((line, index) => (
                    <p key={index}>{line}</p>
                ))}
            </div>
        ) : (
            <p className="text-gray-400 text-sm">This may take a few moments.</p>
        )}
    </div>
  );
};

export default LoadingSpinner;
