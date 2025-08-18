
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { saveTrainingImage } from '../services/geminiService';
import { TRAINING_IMAGE_FORMAT } from '../constants';

// A simple draggable and resizable crop selection component
const CropSelection: React.FC<{
    crop: { x: number; y: number; width: number; height: number; };
    setCrop: React.Dispatch<React.SetStateAction<{ x: number; y: number; width: number; height: number; }>>;
    aspectRatio: number;
    imageRef: React.RefObject<HTMLImageElement>;
}> = ({ crop, setCrop, aspectRatio, imageRef }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0, cropX: 0, cropY: 0 });
    const resizeStartPos = useRef({ x: 0, y: 0, cropW: 0, cropH: 0 });

    const handleMouseDownDrag = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        dragStartPos.current = { x: e.clientX, y: e.clientY, cropX: crop.x, cropY: crop.y };
    };

    const handleMouseDownResize = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizeStartPos.current = { x: e.clientX, y: e.clientY, cropW: crop.width, cropH: crop.height };
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!imageRef.current) return;
        const parentRect = imageRef.current.getBoundingClientRect();

        if (isDragging) {
            const dx = e.clientX - dragStartPos.current.x;
            const dy = e.clientY - dragStartPos.current.y;
            let newX = dragStartPos.current.cropX + dx;
            let newY = dragStartPos.current.cropY + dy;

            // Constrain within image bounds
            newX = Math.max(0, Math.min(newX, parentRect.width - crop.width));
            newY = Math.max(0, Math.min(newY, parentRect.height - crop.height));

            setCrop(c => ({ ...c, x: newX, y: newY }));
        }

        if (isResizing) {
            const dx = e.clientX - resizeStartPos.current.x;
            const dy = e.clientY - resizeStartPos.current.y;

            // Use the larger delta to drive the resize to feel more natural
            const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy * (aspectRatio || 1);

            let newWidth = resizeStartPos.current.cropW + delta;
            let newHeight = aspectRatio > 0 ? newWidth / aspectRatio : resizeStartPos.current.cropH + dy;

            // Constrain within image bounds
            if (crop.x + newWidth > parentRect.width) {
                newWidth = parentRect.width - crop.x;
                if (aspectRatio > 0) newHeight = newWidth / aspectRatio;
            }
            if (crop.y + newHeight > parentRect.height) {
                newHeight = parentRect.height - crop.y;
                if (aspectRatio > 0) newWidth = newHeight * aspectRatio;
            }
             if (newWidth < 20 || newHeight < 20) { // minimum size
                return;
            }

            setCrop(c => ({ ...c, width: newWidth, height: newHeight }));
        }
    }, [isDragging, isResizing, aspectRatio, crop.width, crop.height, crop.x, crop.y, setCrop, imageRef]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setIsResizing(false);
    }, []);
    
    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);


    return (
        <div
            className="absolute border-2 border-dashed border-purple-400 bg-white/20 cursor-move"
            style={{
                left: `${crop.x}px`,
                top: `${crop.y}px`,
                width: `${crop.width}px`,
                height: `${crop.height}px`,
                touchAction: 'none'
            }}
            onMouseDown={handleMouseDownDrag}
        >
            <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-purple-500 rounded-full cursor-se-resize"
                 onMouseDown={handleMouseDownResize}
            />
        </div>
    );
};


const trainingAspectRatios = [
    { name: '1:1', width: 1024, height: 1024 },
    { name: '4:3', width: 1024, height: 768 },
    { name: '3:2', width: 768, height: 512 },
    { name: '16:9', width: 1024, height: 576 },
    { name: '3:4', width: 768, height: 1024 },
    { name: '2:3', width: 512, height: 768 },
    { name: '9:16', width: 576, height: 1024 },
];


const TrainView: React.FC = () => {
    const [imageUrl, setImageUrl] = useState('');
    const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [targetWidth, setTargetWidth] = useState(1024);
    const [targetHeight, setTargetHeight] = useState(1024);

    const [crop, setCrop] = useState({ x: 10, y: 10, width: 200, height: 200 });
    const [croppedImageUrl, setCroppedImageUrl] = useState<string | null>(null);
    
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);

    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const aspectRatio = (targetWidth > 0 && targetHeight > 0) ? targetWidth / targetHeight : 0;

    const resetCropToCenter = useCallback(() => {
        if(imageRef.current && aspectRatio > 0) {
            const image = imageRef.current;
            const imageAspectRatio = image.width / image.height;
            
            let initialWidth, initialHeight;

            if(aspectRatio > imageAspectRatio) {
                initialWidth = image.width * 0.8;
                initialHeight = initialWidth / aspectRatio;
            } else {
                initialHeight = image.height * 0.8;
                initialWidth = initialHeight * aspectRatio;
            }
            
            const initialX = (image.width - initialWidth) / 2;
            const initialY = (image.height - initialHeight) / 2;

            setCrop({ x: initialX, y: initialY, width: initialWidth, height: initialHeight });
        }
    }, [aspectRatio]);
    
    // Add paste event listener to load images from clipboard
    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    if (blob) {
                        event.preventDefault();
                        
                        // Clean up previous image if any
                        if (loadedImageUrl) {
                            URL.revokeObjectURL(loadedImageUrl);
                        }
                        
                        // Reset states
                        setIsLoading(false);
                        setError(null);
                        setCroppedImageUrl(null);
                        setImageUrl(''); // Clear the URL input field
                        
                        const objectURL = URL.createObjectURL(blob);
                        setLoadedImageUrl(objectURL);
                        
                        // Stop after handling the first image
                        return;
                    }
                }
            }
        };

        document.addEventListener('paste', handlePaste);
        return () => {
            document.removeEventListener('paste', handlePaste);
        };
    }, [loadedImageUrl]);


    useEffect(() => {
        resetCropToCenter();
    }, [aspectRatio, loadedImageUrl, resetCropToCenter]);

    const handleLoadImage = () => {
        if (!imageUrl.trim()) {
            setError('Please enter a valid image URL.');
            return;
        }
        setIsLoading(true);
        setError(null);
        if (loadedImageUrl) {
            URL.revokeObjectURL(loadedImageUrl);
        }
        setLoadedImageUrl(null);
        setCroppedImageUrl(null);

        fetch(imageUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch image. Status: ${response.status}`);
                }
                return response.blob();
            })
            .then(blob => {
                 if(!blob.type.startsWith('image/')) {
                    throw new Error('The fetched file is not a valid image.');
                }
                const objectURL = URL.createObjectURL(blob);
                setLoadedImageUrl(objectURL);
            })
            .catch(err => {
                console.error("Image loading error:", err);
                setError(`Could not load image. Check the URL and CORS policy of the source. Error: ${err.message}`);
            })
            .finally(() => {
                setIsLoading(false);
            });
    };

    const handleCropImage = () => {
        if (!imageRef.current || !canvasRef.current || !loadedImageUrl || !targetWidth || !targetHeight) return;

        const image = imageRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;

        const sourceX = crop.x * scaleX;
        const sourceY = crop.y * scaleY;
        const sourceWidth = crop.width * scaleX;
        const sourceHeight = crop.height * scaleY;

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        ctx.drawImage(
            image,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            targetWidth,
            targetHeight
        );

        const dataUrl = canvas.toDataURL(TRAINING_IMAGE_FORMAT);
        setCroppedImageUrl(dataUrl);
        setSaveState('idle');
        setSaveError(null);
    };

    const handleSave = async () => {
        if (!croppedImageUrl) return;

        setSaveState('saving');
        setSaveError(null);
        try {
            await saveTrainingImage(targetWidth, targetHeight, croppedImageUrl);
            setSaveState('saved');
        } catch (err) {
            setSaveState('error');
            if (err instanceof Error) {
                setSaveError(err.message);
            } else {
                setSaveError('An unknown error occurred while saving.');
            }
        }
    };
    
    const handleDimensionChange = (value: string, setter: (val: number) => void) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num > 0) {
            setter(num);
        }
    }

    const getSaveButtonClass = () => {
        switch (saveState) {
            case 'saving':
                return 'bg-gray-500 cursor-not-allowed';
            case 'saved':
                return 'bg-green-600 cursor-not-allowed';
            case 'error':
                return 'bg-red-600 hover:bg-red-700';
            case 'idle':
            default:
                return 'bg-indigo-600 hover:bg-indigo-700';
        }
    };

    return (
        <div className="space-y-8">
            <div className="bg-gray-800/50 p-6 rounded-2xl shadow-lg">
                <h3 className="text-xl font-semibold text-white mb-4">1. Load Image</h3>
                <p className="text-sm text-gray-400 mb-4">
                    Enter an image URL below, or paste an image directly onto the page (Ctrl+V).
                </p>
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <input
                        type="text"
                        className="flex-grow w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200"
                        placeholder="Enter image URL..."
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleLoadImage}
                        disabled={isLoading || !imageUrl.trim()}
                        className="w-full sm:w-auto bg-purple-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-purple-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Loading...' : 'Load from URL'}
                    </button>
                </div>
                 {error && <p className="text-red-400 mt-4">{error}</p>}
            </div>

            {loadedImageUrl && (
                <div className="bg-gray-800/50 p-6 rounded-2xl shadow-lg space-y-6">
                    <h3 className="text-xl font-semibold text-white mb-4">2. Trim Image</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        {/* Image Cropper */}
                        <div className="relative w-full max-w-xl mx-auto flex items-center justify-center bg-gray-900/50 rounded-lg min-h-[300px]" style={{ userSelect: 'none' }}>
                             <img
                                ref={imageRef}
                                src={loadedImageUrl}
                                alt="Source for training"
                                crossOrigin="anonymous" 
                                className="max-w-full max-h-[70vh] object-contain block"
                                onLoad={resetCropToCenter}
                            />
                            {aspectRatio > 0 && <CropSelection crop={crop} setCrop={setCrop} aspectRatio={aspectRatio} imageRef={imageRef} />}
                        </div>
                        {/* Controls */}
                        <div className="space-y-6">
                             <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Target Dimensions
                                </label>
                                <div className="mb-4 flex flex-wrap gap-2">
                                    {trainingAspectRatios.map(ratio => (
                                        <button
                                            key={ratio.name}
                                            onClick={() => {
                                                setTargetWidth(ratio.width);
                                                setTargetHeight(ratio.height);
                                            }}
                                            title={`${ratio.width} x ${ratio.height}`}
                                            aria-pressed={targetWidth === ratio.width && targetHeight === ratio.height}
                                            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200
                                                ${targetWidth === ratio.width && targetHeight === ratio.height
                                                    ? 'bg-purple-500 text-white shadow-lg ring-2 ring-offset-2 ring-offset-gray-800 ring-purple-500'
                                                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                                }`
                                            }
                                        >
                                            {ratio.name}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex-1">
                                         <label htmlFor="target-width" className="sr-only">Width</label>
                                        <input
                                            id="target-width"
                                            type="number"
                                            className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            value={targetWidth}
                                            onChange={(e) => handleDimensionChange(e.target.value, setTargetWidth)}
                                            step="8"
                                            min="8"
                                            placeholder="Width"
                                        />
                                    </div>
                                    <div className="text-gray-500">x</div>
                                    <div className="flex-1">
                                         <label htmlFor="target-height" className="sr-only">Height</label>
                                        <input
                                            id="target-height"
                                            type="number"
                                            className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            value={targetHeight}
                                            onChange={(e) => handleDimensionChange(e.target.value, setTargetHeight)}
                                            step="8"
                                            min="8"
                                            placeholder="Height"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-gray-400 mt-2">Select a preset or enter custom dimensions for the final output.</p>
                            </div>
                            <button
                                onClick={handleCropImage}
                                disabled={!targetWidth || !targetHeight}
                                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 px-4 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Trim Image
                            </button>
                            {croppedImageUrl && (
                                <div className="pt-4 border-t border-gray-700">
                                     <h4 className="text-lg font-semibold text-white mb-2">Result</h4>
                                     <img src={croppedImageUrl} alt="Cropped result" className="rounded-lg max-w-full mx-auto shadow-xl" />
                                     <button
                                        onClick={handleSave}
                                        disabled={saveState === 'saving' || saveState === 'saved'}
                                        className={`w-full text-center mt-4 text-white font-bold py-2 px-4 rounded-lg transition-colors ${getSaveButtonClass()}`}
                                    >
                                        {saveState === 'idle' && 'Save'}
                                        {saveState === 'saving' && 'Saving...'}
                                        {saveState === 'saved' && 'Saved!'}
                                        {saveState === 'error' && 'Retry Save'}
                                    </button>
                                    {saveState === 'error' && saveError && (
                                        <p className="text-red-400 text-sm mt-2 text-center">{saveError}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
    );
};

export default TrainView;
