import React, { useState, useEffect, useRef } from 'react';
import { fetchImageHashes, fetchImageById, submitLabel, fetchImageLabel, fetchImagePrompt } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import ErrorDisplay from './ErrorDisplay';

interface FilterState {
    includeFilterPrompt: string;
    includeFilterNegativePrompt: string;
    excludeFilterPrompt: string;
    excludeFilterNegativePrompt: string;
    labeled: boolean;
}

const LabeledViewPlaceholder: React.FC<{ message: string; subMessage?: string; }> = ({ message, subMessage }) => (
    <div className="flex flex-col items-center justify-center text-center text-gray-500 h-full">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <h3 className="text-xl font-semibold text-gray-400">{message}</h3>
        {subMessage && <p className="mt-1">{subMessage}</p>}
    </div>
);

const LabelingView: React.FC = () => {
    const [filters, setFilters] = useState<FilterState>({
        includeFilterPrompt: '',
        includeFilterNegativePrompt: '',
        excludeFilterPrompt: '',
        excludeFilterNegativePrompt: '',
        labeled: false
    });

    const [imageHashes, setImageHashes] = useState<string[]>([]);
    const [loadedImages, setLoadedImages] = useState<Map<string, string>>(new Map());
    const [fetchingImages, setFetchingImages] = useState<Set<string>>(new Set());
    
    const [currentIndex, setCurrentIndex] = useState<number>(0);
    const [filterApplied, setFilterApplied] = useState(false);

    const [labelPrompt, setLabelPrompt] = useState('');

    const [isFiltering, setIsFiltering] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLabelLoading, setIsLabelLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadedImagesRef = useRef(loadedImages);
    loadedImagesRef.current = loadedImages;

    // Clean up all blob URLs on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            const urlsToClean = Array.from(loadedImagesRef.current.values());
            urlsToClean.forEach(url => {
                if (url && url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            });
        };
    }, []);

    const currentHash = imageHashes[currentIndex];

    // Fetch the label or original prompt for the current image
    useEffect(() => {
        const loadLabel = async () => {
            if (currentHash) {
                setIsLabelLoading(true);
                setLabelPrompt('');
                setError(null);
                try {
                    let label = await fetchImageLabel(currentHash);
                    if (!label.trim()) {
                        label = await fetchImagePrompt(currentHash);
                    }
                    setLabelPrompt(label);
                } catch (err) {
                    if (err instanceof Error) setError(err.message);
                    else setError('Failed to load image details.');
                } finally {
                    setIsLabelLoading(false);
                }
            } else {
                setLabelPrompt(''); // Clear prompt if no image is selected
            }
        };

        loadLabel();
    }, [currentHash]);

    // Pre-fetch images for the current view and filmstrip
    useEffect(() => {
        if (imageHashes.length === 0) return;

        // Fetch images for a window around the current index for the filmstrip
        const FILMSTRIP_RADIUS = 5;
        const start = Math.max(0, currentIndex - FILMSTRIP_RADIUS);
        const end = Math.min(imageHashes.length, currentIndex + FILMSTRIP_RADIUS + 1);

        for (let i = start; i < end; i++) {
            const hash = imageHashes[i];
            if (hash && !loadedImages.has(hash) && !fetchingImages.has(hash)) {
                setFetchingImages(prev => new Set(prev).add(hash));
                fetchImageById(hash)
                    .then(url => {
                        setLoadedImages(prev => new Map(prev).set(hash, url));
                    })
                    .catch(err => {
                        console.error(`Failed to fetch image ${hash}:`, err);
                        // Optionally set an error state for this specific image
                    })
                    .finally(() => {
                        setFetchingImages(prev => {
                            const newSet = new Set(prev);
                            newSet.delete(hash);
                            return newSet;
                        });
                    });
            }
        }
    }, [currentIndex, imageHashes, loadedImages, fetchingImages]);

    const handleFilterChange = (field: keyof FilterState, value: string | boolean) => {
        setFilters(prev => ({ ...prev, [field]: value }));
    };

    const handleApplyFilters = async () => {
        setIsFiltering(true);
        setFilterApplied(true);
        setError(null);
        setCurrentIndex(0);
        setLabelPrompt('');
        
        try {
            const hashes = await fetchImageHashes({
                include_filter_prompt: filters.includeFilterPrompt,
                include_filter_negative_prompt: '',
                exclude_filter_prompt: '',
                exclude_filter_negative_prompt: '',
                labeled: filters.labeled
            });
            setImageHashes(hashes);
        } catch (err) {
            if (err instanceof Error) setError(err.message);
            else setError('An unknown error occurred while filtering images.');
            setImageHashes([]);
        } finally {
            setIsFiltering(false);
        }
    };
    
    const handleNext = () => {
        if (currentIndex < imageHashes.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    };
    
    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };
    
    const currentUrl = currentHash ? loadedImages.get(currentHash) : null;
    const isCurrentImageLoading = currentHash ? fetchingImages.has(currentHash) || !currentUrl : false;


    const handleSubmit = async () => {
        if (!currentHash || isSubmitting || !labelPrompt.trim()) return;

        setIsSubmitting(true);
        setError(null);
        try {
            await submitLabel(currentHash, labelPrompt);
            
            // Clean up the blob URL for the submitted image
            const urlToDelete = loadedImages.get(currentHash);
            if (urlToDelete && urlToDelete.startsWith('blob:')) {
                URL.revokeObjectURL(urlToDelete);
            }

            // Remove submitted image from list and update state
            const newHashes = imageHashes.filter(hash => hash !== currentHash);
            
            setLoadedImages(prev => {
                const newMap = new Map(prev);
                newMap.delete(currentHash);
                return newMap;
            });
            setImageHashes(newHashes);
            
            if (currentIndex >= newHashes.length && newHashes.length > 0) {
                setCurrentIndex(newHashes.length - 1);
            }
            
            setLabelPrompt('');

        } catch (err) {
            if (err instanceof Error) setError(err.message);
            else setError('An unknown error occurred during submission.');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const isNavDisabled = isSubmitting || isFiltering;

    return (
        <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Column: Controls */}
            <div className="w-full lg:w-1/3 lg:max-w-sm space-y-6">
                <div className="bg-gray-800/50 p-6 rounded-2xl shadow-lg space-y-6 sticky top-8">
                    <div>
                        <h3 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-3">Filter Images</h3>
                        <div className="space-y-4 pt-2">
                             <FilterInput label="Search for prompt" value={filters.includeFilterPrompt} onChange={val => handleFilterChange('includeFilterPrompt', val)} disabled={isFiltering} />
                             <div className="flex items-center pt-2">
                                <input
                                    type="checkbox"
                                    id="labeled"
                                    className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-600 disabled:opacity-50"
                                    checked={filters.labeled}
                                    onChange={e => handleFilterChange('labeled', e.target.checked)}
                                    disabled={isFiltering}
                                />
                                <label htmlFor="labeled" className="ml-2 text-sm font-medium text-gray-300">Show only labeled images</label>
                            </div>
                        </div>
                        <button
                            onClick={handleApplyFilters}
                            disabled={isFiltering}
                            className="w-full mt-6 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold py-3 px-4 rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isFiltering ? 'Filtering...' : 'Apply Filters'}
                        </button>
                    </div>

                    {currentHash && !isFiltering && (
                        <div>
                             <h3 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-3">Annotate Image</h3>
                              <div className="space-y-4 pt-2">
                                <div>
                                    <label htmlFor="label-prompt" className="block text-sm font-medium text-gray-300 mb-2">Label Prompt</label>
                                    <textarea 
                                        id="label-prompt" 
                                        rows={4} 
                                        className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50" 
                                        value={labelPrompt} 
                                        onChange={(e) => setLabelPrompt(e.target.value)} 
                                        placeholder={isLabelLoading ? "Loading label..." : "Describe the image content..."} 
                                        disabled={isSubmitting || isLabelLoading}
                                    />
                                </div>
                            </div>
                             <button onClick={handleSubmit} disabled={isSubmitting || !labelPrompt.trim() || isLabelLoading} className="w-full mt-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 px-4 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                {isSubmitting ? 'Submitting...' : 'Submit & Next'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Image Viewer */}
            <div className="w-full lg:w-2/3 flex-1 bg-gray-800/50 rounded-2xl flex flex-col min-h-[550px] lg:h-[calc(100vh-4rem)] overflow-hidden lg:sticky lg:top-8">
                <div className="flex-grow flex items-center justify-center p-4 relative overflow-hidden">
                    {error && <ErrorDisplay error={error} />}
                    {!error && isFiltering && <LoadingSpinner />}
                    {!error && !isFiltering && (
                        <>
                            {!filterApplied && <LabeledViewPlaceholder message="Filter to start labeling" subMessage="Use the controls to find images to annotate." />}
                            {filterApplied && imageHashes.length === 0 && <LabeledViewPlaceholder message="No images match your criteria" subMessage="Try adjusting your filters." />}
                            
                            {currentHash && (
                                <div className="w-full h-full flex items-center justify-center">
                                    {isCurrentImageLoading ? (
                                        <LoadingSpinner />
                                    ) : (
                                        <img 
                                            src={currentUrl || ''} 
                                            alt={`Labeling target ${currentHash}`} 
                                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                                        />
                                    )}
                                </div>
                            )}
                            {imageHashes.length > 0 && (
                                <>
                                    <button onClick={handlePrev} disabled={currentIndex === 0 || isNavDisabled} className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 text-white p-3 rounded-full hover:bg-black/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Previous Image">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    </button>
                                    <button onClick={handleNext} disabled={currentIndex >= imageHashes.length - 1 || isNavDisabled} className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 text-white p-3 rounded-full hover:bg-black/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Next Image">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    </button>
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-sm px-3 py-1 rounded-full">
                                        {currentIndex + 1} / {imageHashes.length}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
                {filterApplied && imageHashes.length > 0 && !isFiltering && (
                   <Filmstrip
                        imageHashes={imageHashes}
                        loadedImages={loadedImages}
                        fetchingImages={fetchingImages}
                        currentIndex={currentIndex}
                        setCurrentIndex={setCurrentIndex}
                    />
                )}
            </div>
        </div>
    );
};

const Filmstrip: React.FC<{
    imageHashes: string[];
    loadedImages: Map<string, string>;
    fetchingImages: Set<string>;
    currentIndex: number;
    setCurrentIndex: (index: number) => void;
}> = ({ imageHashes, loadedImages, fetchingImages, currentIndex, setCurrentIndex }) => {
    const FILMSTRIP_RADIUS = 5;
    const start = Math.max(0, currentIndex - FILMSTRIP_RADIUS);
    const end = Math.min(imageHashes.length, currentIndex + FILMSTRIP_RADIUS + 1);
    
    const filmstripIndices = Array.from({ length: end - start }, (_, i) => start + i);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Scroll the current thumbnail into view
    useEffect(() => {
        const currentThumbnail = scrollContainerRef.current?.querySelector(`[data-index="${currentIndex}"]`);
        currentThumbnail?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [currentIndex]);


    return (
        <div className="flex-shrink-0 h-28 bg-gray-900/50 p-2 border-t-2 border-gray-700">
            <div ref={scrollContainerRef} className="flex justify-center items-center h-full gap-2 overflow-x-auto">
                {filmstripIndices.map((index) => (
                    <FilmstripThumbnail
                        key={imageHashes[index]}
                        hash={imageHashes[index]}
                        index={index}
                        isCurrent={index === currentIndex}
                        url={loadedImages.get(imageHashes[index])}
                        isFetching={fetchingImages.has(imageHashes[index])}
                        onSelect={setCurrentIndex}
                    />
                ))}
            </div>
        </div>
    );
};

const FilmstripThumbnail: React.FC<{
    hash: string;
    index: number;
    isCurrent: boolean;
    url?: string;
    isFetching: boolean;
    onSelect: (index: number) => void;
}> = ({ index, isCurrent, url, isFetching, onSelect }) => {
    return (
        <button
            onClick={() => onSelect(index)}
            data-index={index}
            className={`flex-shrink-0 w-20 h-20 rounded-md overflow-hidden transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 ${isCurrent ? 'border-2 border-purple-400 scale-105' : 'border-2 border-transparent hover:border-gray-500'}`}
            aria-label={`Go to image ${index + 1}`}
            aria-current={isCurrent}
        >
            {url ? (
                <img src={url} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-400">
                    {isFetching ? 
                        <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg> :
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    }
                </div>
            )}
        </button>
    );
};

const FilterInput: React.FC<{label: string, value: string, onChange: (v: string) => void, disabled: boolean}> = ({label, value, onChange, disabled}) => (
    <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        <input
            type="text"
            className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 disabled:opacity-50"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
        />
    </div>
);

export default LabelingView;