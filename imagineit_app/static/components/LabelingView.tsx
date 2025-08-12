import React, { useState, useEffect, useCallback } from 'react';
import { fetchImageHashes, fetchImageById, submitLabel } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import ErrorDisplay from './ErrorDisplay';

interface FilterState {
    includeFilterPrompt: string;
    includeFilterNegativePrompt: string;

    excludeFilterPrompt: string;
    excludeFilterNegativePrompt: string;
    labeled: boolean;
}

const LabeledViewPlaceholder: React.FC<{ message: string; subMessage?: string; isFiltering?: boolean; }> = ({ message, subMessage, isFiltering = false }) => (
    <div className="flex flex-col items-center justify-center text-center text-gray-500 h-full">
        {isFiltering ? <LoadingSpinner /> : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
        )}
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
    const [currentIndex, setCurrentIndex] = useState<number>(0);
    const [currentImage, setCurrentImage] = useState<{ id: string; url: string } | null>(null);

    const [labelPrompt, setLabelPrompt] = useState('');
    const [labelNegativePrompt, setLabelNegativePrompt] = useState('');

    const [isFiltering, setIsFiltering] = useState(false);
    const [isLoadingImage, setIsLoadingImage] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFilterChange = (field: keyof FilterState, value: string | boolean) => {
        setFilters(prev => ({ ...prev, [field]: value }));
    };

    const handleApplyFilters = async () => {
        setIsFiltering(true);
        setError(null);
        setImageHashes([]);
        setCurrentImage(null);
        try {
            const hashes = await fetchImageHashes({
                include_filter_prompt: filters.includeFilterPrompt,
                include_filter_negative_prompt: filters.includeFilterNegativePrompt,
                exclude_filter_prompt: filters.excludeFilterPrompt,
                exclude_filter_negative_prompt: filters.excludeFilterNegativePrompt,
                labeled: filters.labeled
            });
            setImageHashes(hashes);
            setCurrentIndex(0);
        } catch (err) {
            if (err instanceof Error) setError(err.message);
            else setError('An unknown error occurred while filtering images.');
        } finally {
            setIsFiltering(false);
        }
    };
    
    useEffect(() => {
        // Deblob URL on change or unmount
        const imageUrlToClean = currentImage?.url;
        return () => {
            if (imageUrlToClean) {
                URL.revokeObjectURL(imageUrlToClean);
            }
        };
    }, [currentImage]);
    
    useEffect(() => {
        if (imageHashes.length === 0 || currentIndex >= imageHashes.length) {
            setCurrentImage(null);
            return;
        }

        const fetchImage = async () => {
            setIsLoadingImage(true);
            setError(null);
            const hash = imageHashes[currentIndex];
            try {
                const imageUrl = await fetchImageById(hash);
                setCurrentImage({ id: hash, url: imageUrl });
                setLabelPrompt(''); 
                setLabelNegativePrompt('');
            } catch (err) {
                 if (err instanceof Error) setError(err.message);
                 else setError('An unknown error occurred while fetching the image.');
                 setCurrentImage(null);
            } finally {
                setIsLoadingImage(false);
            }
        };
        fetchImage();
    }, [currentIndex, imageHashes]);

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

    const handleSubmit = async () => {
        if (!currentImage || isSubmitting || !labelPrompt.trim()) return;
        setIsSubmitting(true);
        setError(null);
        try {
            await submitLabel(currentImage.id, labelPrompt, labelNegativePrompt);
            handleNext();
        } catch (err) {
            if (err instanceof Error) setError(err.message);
            else setError('An unknown error occurred during submission.');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const isNavDisabled = isLoadingImage || isSubmitting;

    return (
        <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Column: Controls */}
            <div className="w-full lg:w-1/3 lg:max-w-sm space-y-6">
                <div className="bg-gray-800/50 p-6 rounded-2xl shadow-lg space-y-6">
                    <div>
                        <h3 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-3">Filter Images</h3>
                        <div className="space-y-4 pt-2">
                             <FilterInput label="Include Prompt" value={filters.includeFilterPrompt} onChange={val => handleFilterChange('includeFilterPrompt', val)} disabled={isFiltering} />
                             <FilterInput label="Include Negative Prompt" value={filters.includeFilterNegativePrompt} onChange={val => handleFilterChange('includeFilterNegativePrompt', val)} disabled={isFiltering} />
                             <FilterInput label="Exclude Prompt" value={filters.excludeFilterPrompt} onChange={val => handleFilterChange('excludeFilterPrompt', val)} disabled={isFiltering} />
                             <FilterInput label="Exclude Negative Prompt" value={filters.excludeFilterNegativePrompt} onChange={val => handleFilterChange('excludeFilterNegativePrompt', val)} disabled={isFiltering} />
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
                    {currentImage && !isLoadingImage && (
                        <div>
                             <h3 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-3">Annotate Image</h3>
                              <div className="space-y-4 pt-2">
                                <div>
                                    <label htmlFor="label-prompt" className="block text-sm font-medium text-gray-300 mb-2">Label Prompt</label>
                                    <textarea id="label-prompt" rows={4} className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50" value={labelPrompt} onChange={(e) => setLabelPrompt(e.target.value)} placeholder="Describe the image content..." disabled={isSubmitting}/>
                                </div>
                                <div>
                                    <label htmlFor="label-negative-prompt" className="block text-sm font-medium text-gray-300 mb-2">Negative Prompt <span className="text-gray-400">(optional)</span></label>
                                    <textarea id="label-negative-prompt" rows={2} className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50" value={labelNegativePrompt} onChange={(e) => setLabelNegativePrompt(e.target.value)} placeholder="Describe what to avoid..." disabled={isSubmitting} />
                                </div>
                            </div>
                             <button onClick={handleSubmit} disabled={isSubmitting || !labelPrompt.trim()} className="w-full mt-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 px-4 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                {isSubmitting ? 'Submitting...' : 'Submit & Next'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Image Viewer */}
            <div className="w-full lg:w-2/3 flex-1 bg-gray-800/50 rounded-2xl flex items-center justify-center p-4 min-h-[550px] relative">
                {error && <ErrorDisplay error={error} />}
                {!error && isLoadingImage && <LoadingSpinner />}
                {!error && !isLoadingImage && (
                    <>
                        {isFiltering && <LabeledViewPlaceholder message="Filtering images..." isFiltering />}
                        {!isFiltering && imageHashes.length === 0 && <LabeledViewPlaceholder message="Filter to start labeling" subMessage="Use the controls to find images to annotate." />}
                        {!isFiltering && imageHashes.length > 0 && !currentImage && <LabeledViewPlaceholder message="No images match your criteria" subMessage="Try adjusting your filters." />}
                        {currentImage && (
                             <img src={currentImage.url} alt={`Labeling target ${currentImage.id}`} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"/>
                        )}
                        {imageHashes.length > 0 && currentImage && (
                            <>
                                <button onClick={handlePrev} disabled={currentIndex === 0 || isNavDisabled} className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 text-white p-3 rounded-full hover:bg-black/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                <button onClick={handleNext} disabled={currentIndex >= imageHashes.length - 1 || isNavDisabled} className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 text-white p-3 rounded-full hover:bg-black/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
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
        </div>
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