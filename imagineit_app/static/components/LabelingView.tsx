
import React, { useState, useEffect, useCallback } from 'react';
import { fetchUnlabeledImage, submitLabel } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import ErrorDisplay from './ErrorDisplay';

const LabelingView: React.FC = () => {
    const [currentImage, setCurrentImage] = useState<{ id: number; url: string } | null>(null);
    const [labelPrompt, setLabelPrompt] = useState('');
    const [labelNegativePrompt, setLabelNegativePrompt] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [noMoreImages, setNoMoreImages] = useState(false);

    const fetchNextImage = useCallback(async (id: number) => {
        setIsLoading(true);
        setError(null);
        // Clean up previous blob URL
        if (currentImage?.url) {
            URL.revokeObjectURL(currentImage.url);
        }
        try {
            const imageData = await fetchUnlabeledImage(id);
            if (imageData) {
                setCurrentImage(imageData);
                setLabelPrompt('');
                setLabelNegativePrompt('');
                setNoMoreImages(false);
            } else {
                setNoMoreImages(true);
                setCurrentImage(null);
            }
        } catch (err) {
            if (err instanceof Error) setError(err.message);
            else setError('An unknown error occurred while fetching the image.');
        } finally {
            setIsLoading(false);
        }
    }, [currentImage?.url]);

    useEffect(() => {
        // Fetch the first image on component mount
        fetchNextImage(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async () => {
        if (!currentImage || isSubmitting || !labelPrompt.trim()) return;
        setIsSubmitting(true);
        setError(null);
        try {
            await submitLabel(currentImage.id, labelPrompt, labelNegativePrompt);
            // Success! Fetch the next image
            fetchNextImage(currentImage.id + 1);
        } catch (err) {
            if (err instanceof Error) setError(err.message);
            else setError('An unknown error occurred during submission.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderContent = () => {
        if (isLoading) {
            return <div className="flex justify-center items-center h-96"><LoadingSpinner /></div>;
        }
        if (error) {
            return <div className="flex justify-center items-center h-96"><ErrorDisplay error={error} /></div>;
        }
        if (noMoreImages) {
            return (
                <div className="text-center text-gray-400 h-96 flex flex-col justify-center items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mb-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <h3 className="text-2xl font-bold text-gray-300">All Done!</h3>
                    <p className="mt-2 text-lg">You've labeled all available images.</p>
                </div>
            );
        }
        if (currentImage) {
            return (
                 <div className="flex flex-col lg:flex-row gap-8">
                    <div className="w-full lg:w-2/3 flex-1 bg-gray-800/50 rounded-2xl flex items-center justify-center p-4 min-h-[550px]">
                         <img 
                            src={currentImage.url} 
                            alt={`Unlabeled image ${currentImage.id}`}
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                        />
                    </div>
                    <div className="w-full lg:w-1/3 lg:max-w-sm space-y-6 bg-gray-800/50 p-6 rounded-2xl shadow-lg">
                         <div>
                            <label htmlFor="label-prompt" className="block text-sm font-medium text-gray-300 mb-2">
                                Label Prompt
                            </label>
                            <textarea
                                id="label-prompt"
                                rows={4}
                                className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50"
                                value={labelPrompt}
                                onChange={(e) => setLabelPrompt(e.target.value)}
                                placeholder="Describe the image content..."
                                disabled={isSubmitting}
                            />
                        </div>
                        <div>
                            <label htmlFor="label-negative-prompt" className="block text-sm font-medium text-gray-300 mb-2">
                                Negative Prompt <span className="text-gray-400">(optional)</span>
                            </label>
                            <textarea
                                id="label-negative-prompt"
                                rows={2}
                                className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50"
                                value={labelNegativePrompt}
                                onChange={(e) => setLabelNegativePrompt(e.target.value)}
                                placeholder="Describe what to avoid..."
                                disabled={isSubmitting}
                            />
                        </div>
                         <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !labelPrompt.trim()}
                            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 px-4 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Label & Next'}
                        </button>
                    </div>
                </div>
            );
        }
        return null;
    }

    return (
        <div>
            {renderContent()}
        </div>
    );
};

export default LabelingView;