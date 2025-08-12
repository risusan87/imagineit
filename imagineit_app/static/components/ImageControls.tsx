import React from 'react';
import { MIN_STEPS, MAX_STEPS, MIN_GUIDANCE, MAX_GUIDANCE, MIN_DIMENSION, MAX_DIMENSION } from '../constants';

interface ImageControlsProps {
    prompt: string;
    setPrompt: (prompt: string) => void;
    negativePrompt: string;
    setNegativePrompt: (prompt: string) => void;
    width: number;
    setWidth: (width: number) => void;
    height: number;
    setHeight: (height: number) => void;
    seed: number | null;
    setSeed: (seed: number | null) => void;
    steps: number;
    setSteps: (steps: number) => void;
    guidanceScale: number;
    setGuidanceScale: (scale: number) => void;
    batchSize: number;
    setBatchSize: (size: number) => void;
    inferenceCount: number;
    setInferenceCount: (count: number) => void;
    isLoading: boolean;
    onGenerate: () => void;
}

const ImageControls: React.FC<ImageControlsProps> = ({ 
    prompt, setPrompt, 
    negativePrompt, setNegativePrompt, 
    width, setWidth,
    height, setHeight,
    seed, setSeed, 
    steps, setSteps,
    guidanceScale, setGuidanceScale,
    batchSize, setBatchSize,
    inferenceCount, setInferenceCount,
    isLoading, onGenerate 
}) => {
    
    const handleRandomSeed = () => {
        const randomSeed = Math.floor(Math.random() * 2**32);
        setSeed(randomSeed);
    };

    const handleSeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '') {
            setSeed(null);
        } else {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0) {
                setSeed(num);
            }
        }
    };
    
    return (
        <div className="bg-gray-800/50 p-6 rounded-2xl shadow-lg flex flex-col h-full sticky top-8">
            <div className="space-y-6 flex-grow">
                <div>
                    <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">
                        Your Prompt
                    </label>
                    <textarea
                        id="prompt"
                        rows={4}
                        className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., A majestic lion wearing a crown, studio lighting"
                        disabled={isLoading}
                    />
                </div>
                <div>
                    <label htmlFor="negative-prompt" className="block text-sm font-medium text-gray-300 mb-2">
                        Negative Prompt <span className="text-gray-400">(what to avoid)</span>
                    </label>
                    <textarea
                        id="negative-prompt"
                        rows={2}
                        className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50"
                        value={negativePrompt}
                        onChange={(e) => setNegativePrompt(e.target.value)}
                        placeholder="e.g., blurry, text, watermark, disfigured"
                        disabled={isLoading}
                    />
                </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Image Dimensions
                    </label>
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                             <label htmlFor="width" className="sr-only">Width</label>
                            <input
                                id="width"
                                type="number"
                                className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={width}
                                onChange={(e) => setWidth(Number(e.target.value))}
                                disabled={isLoading}
                                min={MIN_DIMENSION}
                                max={MAX_DIMENSION}
                                placeholder="Width"
                            />
                        </div>
                        <div className="text-gray-500">x</div>
                        <div className="flex-1">
                             <label htmlFor="height" className="sr-only">Height</label>
                            <input
                                id="height"
                                type="number"
                                className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={height}
                                onChange={(e) => setHeight(Number(e.target.value))}
                                disabled={isLoading}
                                min={MIN_DIMENSION}
                                max={MAX_DIMENSION}
                                placeholder="Height"
                            />
                        </div>
                    </div>
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Generation Settings
                    </label>
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                             <label htmlFor="inference-count" className="text-xs text-gray-400 mb-1 block">Inference Count</label>
                            <input
                                id="inference-count"
                                type="number"
                                className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={inferenceCount}
                                onChange={(e) => setInferenceCount(Math.max(1, Number(e.target.value)))}
                                disabled={isLoading}
                                min="1"
                            />
                        </div>
                        <div className="flex-1">
                             <label htmlFor="batch-size" className="text-xs text-gray-400 mb-1 block">Batch Size</label>
                            <input
                                id="batch-size"
                                type="number"
                                className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={batchSize}
                                onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value)))}
                                disabled={isLoading}
                                min="1"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label htmlFor="steps" className="flex justify-between text-sm font-medium text-gray-300 mb-2">
                        <span>Sample Steps</span>
                        <span className="text-purple-400 font-semibold">{steps}</span>
                    </label>
                    <input
                        id="steps"
                        type="range"
                        min={MIN_STEPS}
                        max={MAX_STEPS}
                        value={steps}
                        onChange={(e) => setSteps(Number(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50"
                        disabled={isLoading}
                    />
                </div>

                <div>
                    <label htmlFor="guidance" className="flex justify-between text-sm font-medium text-gray-300 mb-2">
                        <span>Guidance Scale</span>
                        <span className="text-purple-400 font-semibold">{guidanceScale.toFixed(1)}</span>
                    </label>
                    <input
                        id="guidance"
                        type="range"
                        min={MIN_GUIDANCE}
                        max={MAX_GUIDANCE}
                        step={0.1}
                        value={guidanceScale}
                        onChange={(e) => setGuidanceScale(Number(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50"
                        disabled={isLoading}
                    />
                </div>
                
                 <div>
                    <label htmlFor="seed" className="block text-sm font-medium text-gray-300 mb-2">
                        Seed <span className="text-gray-400">(for reproducibility)</span>
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="seed"
                            type="number"
                            className="flex-grow w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={seed ?? ''}
                            onChange={handleSeedChange}
                            placeholder="Leave blank for random"
                            disabled={isLoading}
                            min="0"
                        />
                        <button
                            onClick={handleRandomSeed}
                            disabled={isLoading}
                            className="p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
                            title="Generate random seed"
                            aria-label="Generate random seed"
                        >
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5m-6 0a4 4 0 100-8 4 4 0 000 8zm-6 4h4m12 0h-4" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            <div className="mt-8">
                <button
                    onClick={onGenerate}
                    disabled={isLoading || !prompt.trim()}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 px-4 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
                >
                    {isLoading ? 'Generating...' : 'Generate Image'}
                </button>
            </div>
        </div>
    );
};

export default ImageControls;