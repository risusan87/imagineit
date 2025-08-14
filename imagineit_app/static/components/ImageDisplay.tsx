
import React, { useState, useEffect, useRef } from 'react';
import LoadingSpinner from './LoadingSpinner';
import ErrorDisplay from './ErrorDisplay';

interface ImageDisplayProps {
    generatedImages: string[] | null;
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

const FilmstripThumbnail: React.FC<{
    url: string;
    index: number;
    isCurrent: boolean;
    onSelect: (index: number) => void;
    prompt: string;
}> = ({ url, index, isCurrent, onSelect, prompt }) => {
    return (
        <button
            onClick={() => onSelect(index)}
            data-index={index}
            className={`flex-shrink-0 w-20 h-20 rounded-md overflow-hidden transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 ${isCurrent ? 'border-2 border-purple-400 scale-105' : 'border-2 border-transparent hover:border-gray-500'}`}
            aria-label={`Go to image ${index + 1}`}
            aria-current={isCurrent}
        >
            <img src={url} alt={`Thumbnail for "${prompt}" (${index + 1})`} className="w-full h-full object-cover" />
        </button>
    );
};

const Filmstrip: React.FC<{
    images: string[];
    currentIndex: number;
    setCurrentIndex: (index: number) => void;
    prompt: string;
}> = ({ images, currentIndex, setCurrentIndex, prompt }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Scroll the current thumbnail into view
    useEffect(() => {
        const currentThumbnail = scrollContainerRef.current?.querySelector(`[data-index="${currentIndex}"]`);
        currentThumbnail?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [currentIndex]);

    return (
        <div className="flex-shrink-0 h-28 bg-gray-900/50 p-2 border-t-2 border-gray-700">
            <div ref={scrollContainerRef} className="flex justify-center items-center h-full gap-2 overflow-x-auto">
                {images.map((url, index) => (
                    <FilmstripThumbnail
                        key={url}
                        url={url}
                        index={index}
                        isCurrent={index === currentIndex}
                        onSelect={setCurrentIndex}
                        prompt={prompt}
                    />
                ))}
            </div>
        </div>
    );
};


const ImageDisplay: React.FC<ImageDisplayProps> = ({ generatedImages, isLoading, error, prompt }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Reset index when new images are generated
    useEffect(() => {
        setCurrentIndex(0);
    }, [generatedImages]);

    // Clean up the object URLs when the component unmounts or the images change
    useEffect(() => {
        const imagesToClean = generatedImages;
        return () => {
            if (imagesToClean) {
                imagesToClean.forEach(imgUrl => {
                    if (imgUrl && imgUrl.startsWith('blob:')) {
                        URL.revokeObjectURL(imgUrl);
                    }
                });
            }
        };
    }, [generatedImages]);

    const handleNext = () => {
        if (generatedImages && currentIndex < generatedImages.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    };
    
    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const currentImage = generatedImages ? generatedImages[currentIndex] : null;
    const hasImages = !isLoading && !error && generatedImages && generatedImages.length > 0;

    return (
        <div className="bg-gray-800/50 rounded-2xl w-full flex flex-col min-h-[550px] lg:h-[calc(100vh-4rem)] overflow-hidden lg:sticky lg:top-8">
            <div className="flex-grow flex items-center justify-center p-4 relative overflow-hidden">
                {isLoading && <LoadingSpinner />}
                {!isLoading && error && <ErrorDisplay error={error} />}
                {!isLoading && !error && !generatedImages && <ImagePlaceholder />}
                {!isLoading && !error && generatedImages && generatedImages.length === 0 && (
                    <div className="text-center text-gray-400">
                        <h3 className="text-xl font-semibold">No images were generated.</h3>
                        <p>Try adjusting your prompt or parameters.</p>
                    </div>
                )}
                {hasImages && currentImage && (
                    <>
                        <img 
                            src={currentImage} 
                            alt={`${prompt} (${currentIndex + 1} of ${generatedImages?.length})` || 'Generated image'} 
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                        />
                        {generatedImages && generatedImages.length > 1 && (
                             <>
                                <button onClick={handlePrev} disabled={currentIndex === 0} className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 text-white p-3 rounded-full hover:bg-black/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                <button onClick={handleNext} disabled={currentIndex >= generatedImages.length - 1} className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 text-white p-3 rounded-full hover:bg-black/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </button>
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-sm px-3 py-1 rounded-full">
                                    {currentIndex + 1} / {generatedImages.length}
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
            {hasImages && generatedImages.length > 1 && (
                <Filmstrip
                    images={generatedImages}
                    currentIndex={currentIndex}
                    setCurrentIndex={setCurrentIndex}
                    prompt={prompt}
                />
            )}
        </div>
    );
};

export default ImageDisplay;
