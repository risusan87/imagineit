
import React from 'react';
import LoadingSpinner from './LoadingSpinner';
import ErrorDisplay from './ErrorDisplay';

interface ImageDisplayProps {
    generatedImage: string | null;
    isLoading: boolean;
    error: string | null;
    prompt: string;
}

const ImagePlaceholder: React.FC = () => (
    <div className="flex flex-col items-center justify-center text-center text-gray-500">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="text-xl font-semibold text-gray-400">Your masterpiece awaits</h3>
        <p className="mt-1">Enter a prompt and click "Generate Image" to see the magic happen.</p>
    </div>
);

const ImageDisplay: React.FC<ImageDisplayProps> = ({ generatedImage, isLoading, error, prompt }) => {
    // Clean up the object URL when the component unmounts or the image changes
    React.useEffect(() => {
        return () => {
            if (generatedImage && generatedImage.startsWith('blob:')) {
                URL.revokeObjectURL(generatedImage);
            }
        };
    }, [generatedImage]);

    return (
        <div className="bg-gray-800/50 rounded-2xl w-full h-full min-h-[300px] lg:min-h-[550px] flex items-center justify-center p-4">
            {isLoading && <LoadingSpinner />}
            {!isLoading && error && <ErrorDisplay error={error} />}
            {!isLoading && !error && generatedImage && (
                <img 
                    src={generatedImage} 
                    alt={prompt || 'Generated image'} 
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                />
            )}
            {!isLoading && !error && !generatedImage && <ImagePlaceholder />}
        </div>
    );
};

export default ImageDisplay;
