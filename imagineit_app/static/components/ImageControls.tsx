import React, { useState, useMemo } from 'react';
import { 
    MIN_STEPS, MAX_STEPS, 
    MIN_GUIDANCE, MAX_GUIDANCE, 
    MIN_DIMENSION, MAX_DIMENSION, 
    DEFAULT_WIDTH, DEFAULT_HEIGHT, DIMENSION_STEP,
    PREDEFINED_ASPECT_RATIOS
} from '../constants';
import { mountLora } from '../services/geminiService';
import { LoraModelConfig } from '../types';

interface ImageControlsProps {
    prompt: string;
    setPrompt: (prompt: string) => void;
    negativePrompt: string;
    setNegativePrompt: (prompt: string) => void;
    loraModels: LoraModelConfig[];
    setLoraModels: (loras: LoraModelConfig[]) => void;
    width: number | '';
    setWidth: (width: number | '') => void;
    height: number | '';
    setHeight: (height: number | '') => void;
    seed: number | null;
    setSeed: (seed: number | null) => void;
    alwaysRandomSeed: boolean;
    setAlwaysRandomSeed: (val: boolean) => void;
    steps: number;
    setSteps: (steps: number) => void;
    guidanceScale: number;
    setGuidanceScale: (scale: number) => void;
    batchSize: number | '';
    setBatchSize: (size: number | '') => void;
    inferenceCount: number | '';
    setInferenceCount: (count: number | '') => void;
    isLoading: boolean;
    onGenerate: () => void;
}

const AspectRatioVisualizer: React.FC<{ width: number | ''; height: number | '' }> = ({ width, height }) => {
    const containerBaseClasses = "h-40 w-full bg-gray-900/50 rounded-lg transition-all duration-300";

    if (width === '' || height === '' || +width === 0 || +height === 0) {
        return (
            <div className={`${containerBaseClasses} flex items-center justify-center text-center text-gray-500 text-sm p-4`}>
                Select an aspect ratio or enter custom dimensions
            </div>
        );
    }

    const numericWidth = Number(width);
    const numericHeight = Number(height);

    return (
        <div className={`${containerBaseClasses} flex items-center justify-center p-4`}>
            {/* 
                The inner visualizer uses aspect-ratio to maintain its shape.
                By setting height to 100% and max-width to 100%, we ensure it fills the container vertically
                while respecting the aspect ratio, and it won't overflow horizontally. This effectively
                simulates a 'contain' behavior.
            */}
            <div
                style={{
                    aspectRatio: `${numericWidth} / ${numericHeight}`,
                    height: '100%',
                    transition: 'all 0.3s ease-in-out',
                }}
                className="bg-purple-500/30 border-2 border-purple-400 rounded-md shadow-inner w-auto max-w-full"
            />
        </div>
    );
};


const ImageControls: React.FC<ImageControlsProps> = ({ 
    prompt, setPrompt, 
    negativePrompt, setNegativePrompt,
    loraModels, setLoraModels,
    width, setWidth,
    height, setHeight,
    seed, setSeed, 
    alwaysRandomSeed, setAlwaysRandomSeed,
    steps, setSteps,
    guidanceScale, setGuidanceScale,
    batchSize, setBatchSize,
    inferenceCount, setInferenceCount,
    isLoading, onGenerate 
}) => {
    
    const [loraLoadState, setLoraLoadState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [loraError, setLoraError] = useState<string | null>(null);

    const isMultiImage = Number(batchSize) > 1 || Number(inferenceCount) > 1;

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
    
    const handleDimensionChange = (value: string, setter: (val: number | '') => void) => {
        if (value === '') {
            setter('');
        } else {
            const num = parseInt(value, 10);
            if (!isNaN(num)) {
                setter(num);
            }
        }
    };

    const handleDimensionBlur = (
        value: number | '',
        setter: (val: number) => void,
        defaultValue: number
    ) => {
        let num = value === '' ? defaultValue : Number(value);

        if (isNaN(num)) {
            num = defaultValue;
        }

        // Clamp the value
        num = Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, num));

        // Round to the nearest multiple of DIMENSION_STEP
        let validatedNum = Math.round(num / DIMENSION_STEP) * DIMENSION_STEP;

        // Ensure the rounded value is not below the minimum dimension
        if (validatedNum < MIN_DIMENSION) {
            validatedNum = MIN_DIMENSION;
        }

        setter(validatedNum);
    };
    
    const handleLoraChange = (index: number, field: 'model' | 'weight', value: string) => {
        const newLoraModels = [...loraModels];
        const updatedModel = { ...newLoraModels[index] };

        if (field === 'weight') {
            // Allow empty, numbers, and a single decimal point for flexible input
            if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
                const num = parseFloat(value);
                // Prevent values outside the 0-1 range
                if (!isNaN(num) && (num < 0 || num > 1)) {
                    return;
                }
                updatedModel.weight = value;
            }
        } else {
            updatedModel.model = value;
        }
        newLoraModels[index] = updatedModel;
        setLoraModels(newLoraModels);
        setLoraLoadState('idle'); // Reset on change
    };

    const handleAddLora = () => {
        setLoraModels([...loraModels, { model: '', weight: '' }]);
    };

    const handleRemoveLora = (index: number) => {
        if (loraModels.length > 1) {
            setLoraModels(loraModels.filter((_, i) => i !== index));
        } else {
            // If it's the last one, just clear its values
            setLoraModels([{ model: '', weight: '' }]);
        }
    };

    const { totalWeight, hasWeights, areWeightsValid } = useMemo(() => {
        const activeLoras = loraModels.filter(l => l.model.trim() !== '');
        const hasWeights = activeLoras.some(l => l.weight.trim() !== '');
        const totalWeight = activeLoras.reduce((sum, lora) => sum + (parseFloat(lora.weight) || 0), 0);
        // Weights are valid if none are specified, or if they are specified and sum to 1.
        const areWeightsValid = !hasWeights || Math.abs(totalWeight - 1.0) < 0.001;
        return { totalWeight, hasWeights, areWeightsValid };
    }, [loraModels]);

    const handleLoadLora = async () => {
        const modelsToLoad = loraModels.filter(l => l.model.trim() !== '');
        if (modelsToLoad.length === 0 || loraLoadState === 'loading') return;

        if (!areWeightsValid) {
            setLoraLoadState('error');
            setLoraError('Adapter weights must sum to 1.0.');
            return;
        }

        setLoraLoadState('loading');
        setLoraError(null);

        try {
            await mountLora(modelsToLoad);
            setLoraLoadState('success');
            setTimeout(() => setLoraLoadState('idle'), 3000); // Reset after 3s
        } catch (err) {
            setLoraLoadState('error');
            if (err instanceof Error) {
                setLoraError(err.message);
            } else {
                setLoraError('An unknown error occurred.');
            }
        }
    };

    const canLoadLora = loraModels.some(l => l.model.trim() !== '') && loraLoadState !== 'loading';


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
                        LoRA Models <span className="text-gray-400">(optional)</span>
                    </label>
                    <div className="space-y-3">
                        {loraModels.map((lora, index) => (
                             <div key={index} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    className="flex-grow w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50"
                                    value={lora.model}
                                    onChange={(e) => handleLoraChange(index, 'model', e.target.value)}
                                    placeholder={`LoRA Model ${index + 1}`}
                                    disabled={isLoading}
                                    aria-label={`LoRA Model ${index + 1} name`}
                                />
                                <input
                                    type="text" // Use text to allow partial input like "0."
                                    className="w-24 bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50 [appearance:textfield]"
                                    value={lora.weight}
                                    onChange={(e) => handleLoraChange(index, 'weight', e.target.value)}
                                    placeholder="Weight"
                                    disabled={isLoading}
                                    aria-label={`LoRA Model ${index + 1} weight`}
                                />
                                <button
                                    onClick={() => handleRemoveLora(index)}
                                    disabled={isLoading}
                                    className="p-3 bg-gray-700 hover:bg-red-800/50 rounded-lg transition-colors disabled:opacity-50 text-gray-400 hover:text-red-400"
                                    aria-label={`Remove LoRA Model ${index + 1}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                     <button
                        onClick={handleAddLora}
                        disabled={isLoading}
                        className="w-full mt-3 text-sm text-purple-400 hover:text-purple-300 font-semibold py-2 px-4 rounded-lg border-2 border-dashed border-gray-600 hover:border-purple-500 transition-colors disabled:opacity-50"
                    >
                        + Add another LoRA
                    </button>
                    <div className="flex items-center justify-between mt-3">
                         <button
                            onClick={handleLoadLora}
                            disabled={isLoading || !canLoadLora}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold flex-shrink-0"
                            aria-label="Load LoRA models"
                        >
                           {loraLoadState === 'loading' ? 'Loading...' : 'Load Models'}
                        </button>
                        {hasWeights && (
                            <p className={`text-xs font-mono transition-colors ${areWeightsValid ? 'text-gray-400' : 'text-red-400'}`}>
                                Sum: {totalWeight.toFixed(2)} / 1.0
                            </p>
                        )}
                    </div>
                     <div className="text-xs mt-2 h-4">
                        {loraLoadState === 'success' && <p className="text-green-400">LoRA models loaded successfully!</p>}
                        {loraLoadState === 'error' && <p className="text-red-400">{loraError}</p>}
                    </div>
                </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Image Dimensions
                    </label>

                    <div className="mb-4">
                        <AspectRatioVisualizer width={width} height={height} />
                    </div>

                    <div className="mb-4 space-y-4">
                        {PREDEFINED_ASPECT_RATIOS.map(group => (
                            <div key={group.name}>
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group.name}</h4>
                                <div className="flex flex-wrap gap-2">
                                    {group.ratios.map(aspect => (
                                        <button
                                            key={aspect.ratio}
                                            onClick={() => {
                                                setWidth(aspect.width);
                                                setHeight(aspect.height);
                                            }}
                                            disabled={isLoading}
                                            title={`${aspect.width} x ${aspect.height}`}
                                            aria-pressed={width === aspect.width && height === aspect.height}
                                            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 disabled:opacity-50
                                                ${width === aspect.width && height === aspect.height
                                                    ? 'bg-purple-500 text-white shadow-lg ring-2 ring-offset-2 ring-offset-gray-800 ring-purple-500'
                                                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                                }`
                                            }
                                        >
                                            {aspect.ratio}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                             <label htmlFor="width" className="sr-only">Width</label>
                            <input
                                id="width"
                                type="number"
                                className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50"
                                value={width}
                                onChange={(e) => handleDimensionChange(e.target.value, setWidth)}
                                onBlur={() => handleDimensionBlur(width, setWidth, DEFAULT_WIDTH)}
                                disabled={isLoading}
                                min={MIN_DIMENSION}
                                max={MAX_DIMENSION}
                                step={DIMENSION_STEP}
                                placeholder="Width"
                            />
                        </div>
                        <div className="text-gray-500">x</div>
                        <div className="flex-1">
                             <label htmlFor="height" className="sr-only">Height</label>
                            <input
                                id="height"
                                type="number"
                                className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50"
                                value={height}
                                onChange={(e) => handleDimensionChange(e.target.value, setHeight)}
                                onBlur={() => handleDimensionBlur(height, setHeight, DEFAULT_HEIGHT)}
                                disabled={isLoading}
                                min={MIN_DIMENSION}
                                max={MAX_DIMENSION}
                                step={DIMENSION_STEP}
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
                                className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50"
                                value={inferenceCount}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                        setInferenceCount('');
                                    } else {
                                        const num = parseInt(value, 10);
                                        if (!isNaN(num) && num > 0) {
                                            setInferenceCount(num);
                                        }
                                    }
                                }}
                                onBlur={(e) => {
                                    const num = parseInt(e.target.value, 10);
                                    if (isNaN(num) || num < 1) {
                                        setInferenceCount(1);
                                    }
                                }}
                                disabled={isLoading}
                                min="1"
                                placeholder="1"
                            />
                        </div>
                        <div className="flex-1">
                             <label htmlFor="batch-size" className="text-xs text-gray-400 mb-1 block">Batch Size</label>
                            <input
                                id="batch-size"
                                type="number"
                                className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50"
                                value={batchSize}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                        setBatchSize('');
                                    } else {
                                        const num = parseInt(value, 10);
                                        if (!isNaN(num) && num > 0) {
                                            setBatchSize(num);
                                        }
                                    }
                                }}
                                onBlur={(e) => {
                                    const num = parseInt(e.target.value, 10);
                                    if (isNaN(num) || num < 1) {
                                        setBatchSize(1);
                                    }
                                }}
                                disabled={isLoading}
                                min="1"
                                placeholder="1"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label htmlFor="seed" className="block text-sm font-medium text-gray-300 mb-2">
                        Seed <span className="text-gray-400">(for reproducibility)</span>
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="seed"
                            type="number"
                            className="flex-grow w-full bg-gray-700 border-gray-600 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={seed ?? ''}
                            onChange={handleSeedChange}
                            placeholder={alwaysRandomSeed ? "Random each time" : "Leave blank for random"}
                            disabled={isLoading || isMultiImage || alwaysRandomSeed}
                            min="0"
                        />
                        <button
                            onClick={handleRandomSeed}
                            disabled={isLoading || isMultiImage || alwaysRandomSeed}
                            className="p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Generate random seed"
                            aria-label="Generate random seed"
                        >
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5m-6 0a4 4 0 100-8 4 4 0 000 8zm-6 4h4m12 0h-4" />
                            </svg>
                        </button>
                    </div>
                     <div className="flex items-center mt-3">
                        <input
                            type="checkbox"
                            id="always-random-seed"
                            className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-600 disabled:opacity-50"
                            checked={alwaysRandomSeed}
                            onChange={(e) => setAlwaysRandomSeed(e.target.checked)}
                            disabled={isLoading || isMultiImage}
                        />
                        <label htmlFor="always-random-seed" className="ml-2 text-sm font-medium text-gray-300 select-none">
                            Always use random seed
                        </label>
                    </div>
                     {isMultiImage && (
                        <p className="text-xs text-gray-400 mt-2">
                            Seed is disabled when generating more than one image.
                        </p>
                    )}
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