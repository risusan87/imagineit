
import React, { useState, useEffect, useRef } from 'react';
import LoadingSpinner from './LoadingSpinner';
import ErrorDisplay from './ErrorDisplay';
import { ImageGeneration } from '../types';

interface ImageDisplayProps {
    imageGenerations: ImageGeneration[];
    isBatchInProgress: boolean;
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

const FilmstripThumbnail: React.FC<{
    generation: ImageGeneration;
    index: number;
    isCurrent: boolean;
    onSelect: (index: number) => void;
}> = ({ generation, index, isCurrent, onSelect }) => {
    // Defensive check for undefined generation object
    if (!generation) {
        return (
            <div className="relative flex-shrink-0 w-20 h-20 rounded-md bg-gray-800 border-2 border-transparent" />
        );
    }
    return (
        <button
            onClick={() => onSelect(index)}
            data-index={index}
            className={`relative flex-shrink-0 w-20 h-20 rounded-md overflow-hidden transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 ${isCurrent ? 'border-2 border-purple-400 scale-105' : 'border-2 border-transparent hover:border-gray-500'}`}
            aria-label={`Go to image ${index + 1}`}
            aria-current={isCurrent}
        >
            {generation.imageUrl ? (
                <img src={generation.imageUrl} alt={`Thumbnail for image ${index + 1}`} className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-400">
                    {generation.status === 'generating' || (generation.status === 'completed' && !generation.imageUrl) ? 
                        <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg> :
                        <span className="text-2xl font-bold">{index + 1}</span>
                    }
                </div>
            )}
            {generation.status === 'failed' && (
                <div className="absolute inset-0 bg-red-800/70 flex items-center justify-center" title={generation.progressText}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                </div>
            )}
        </button>
    );
};

const Filmstrip: React.FC<{
    generations: ImageGeneration[];
    currentIndex: number;
    setCurrentIndex: (index: number) => void;
}> = ({ generations, currentIndex, setCurrentIndex }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const currentThumbnail = scrollContainerRef.current?.querySelector(`[data-index="${currentIndex}"]`);
        currentThumbnail?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [currentIndex]);

    return (
        <div className="flex-shrink-0 h-28 bg-gray-900/50 p-2 border-t-2 border-gray-700">
            <div ref={scrollContainerRef} className="flex justify-center items-center h-full gap-2 overflow-x-auto">
                {generations.map((gen, index) => (
                    <FilmstripThumbnail
                        key={gen ? gen.id : index}
                        generation={gen}
                        index={index}
                        isCurrent={index === currentIndex}
                        onSelect={setCurrentIndex}
                    />
                ))}
            </div>
        </div>
    );
};


const ImageDisplay: React.FC<ImageDisplayProps> = ({ imageGenerations, isBatchInProgress, error, prompt }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const imageGenerationsRef = useRef(imageGenerations);
    imageGenerationsRef.current = imageGenerations;

    // Clean up object URLs when the component unmounts or is re-keyed.
    // This prevents memory leaks by revoking blob URLs that are no longer needed.
    useEffect(() => {
        return () => {
            imageGenerationsRef.current.forEach(gen => {
                if (gen && gen.imageUrl && gen.imageUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(gen.imageUrl);
                }
            });
        };
    }, []); // Empty dependency array ensures this runs only on unmount.

    const handleNext = () => {
        if (currentIndex < imageGenerations.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    };
    
    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const currentGeneration = imageGenerations[currentIndex];
    const totalCount = imageGenerations.length;
    const completedCount = imageGenerations.filter(g => g && (g.status === 'completed' || g.status === 'failed')).length;
    const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return (
        <div className="bg-gray-800/50 rounded-2xl w-full flex flex-col min-h-[550px] lg:h-[calc(100vh-4rem)] overflow-hidden lg:sticky lg:top-8">
            {isBatchInProgress && (
                 <div className="p-4 flex-shrink-0">
                    <div className="flex justify-between items-center mb-1 text-sm font-medium text-gray-300">
                        <span>Overall Progress</span>
                        <span>{completedCount} / {totalCount}</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                        <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                </div>
            )}
            <div className="flex-grow flex items-center justify-center p-4 relative overflow-hidden">
                {(() => {
                    if (error) {
                        return <ErrorDisplay error={error} />;
                    }
                    if (!currentGeneration && !isBatchInProgress) {
                        return <ImagePlaceholder />;
                    }
                    if (currentGeneration) {
                         switch (currentGeneration.status) {
                            case 'completed':
                                if (currentGeneration.imageUrl) {
                                    return (
                                        <img 
                                            src={currentGeneration.imageUrl} 
                                            alt={`${prompt} (${currentIndex + 1} of ${totalCount})`}
                                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                                        />
                                    );
                                }
                                // Explicitly render LoadingSpinner for completed status without URL
                                return <LoadingSpinner progress={currentGeneration.progressText || 'Fetching image...'} />;
                            case 'generating':
                                return <LoadingSpinner progress={currentGeneration.progressText} />;
                             case 'failed':
                                return <ErrorDisplay error={currentGeneration.progressText || 'Generation for this image failed.'} />;
                            case 'queued':
                                return <LoadingSpinner progress="Waiting in queue..." />;
                        }
                    }
                    return <LoadingSpinner progress="Preparing generation..." />; // Fallback while state initializes
                })()}

                {totalCount > 1 && (
                     <>
                        <button onClick={handlePrev} disabled={currentIndex === 0} className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 text-white p-3 rounded-full hover:bg-black/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button onClick={handleNext} disabled={currentIndex >= totalCount - 1} className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 text-white p-3 rounded-full hover:bg-black/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </>
                )}
            </div>
            {totalCount > 0 && (
                <Filmstrip
                    generations={imageGenerations}
                    currentIndex={currentIndex}
                    setCurrentIndex={setCurrentIndex}
                />
            )}
        </div>
    );
};

export default ImageDisplay;
