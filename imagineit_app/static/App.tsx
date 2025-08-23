
import React, { useState, useCallback, useEffect } from 'react';
import { 
    DEFAULT_STEPS, DEFAULT_GUIDANCE, DEFAULT_WIDTH, DEFAULT_HEIGHT,
    COOKIE_PROMPT, COOKIE_NEGATIVE_PROMPT, COOKIE_WIDTH, COOKIE_HEIGHT,
    COOKIE_SEED, COOKIE_STEPS, COOKIE_GUIDANCE_SCALE, COOKIE_BATCH_SIZE,
    COOKIE_INFERENCE_COUNT, COOKIE_ACTIVE_TAB, COOKIE_EXPIRATION_DAYS,
    COOKIE_ALWAYS_RANDOM_SEED, COOKIE_BACKEND_MODE, COOKIE_DEDICATED_DOMAIN,
    COOKIE_LORA_MODEL
} from './constants';
import { generateImage } from './services/geminiService';
import Header from './components/Header';
import ImageControls from './components/ImageControls';
import ImageDisplay from './components/ImageDisplay';
import Tabs, { Tab } from './components/Tabs';
import LabelingView from './components/LabelingView';
import TrainView from './components/TrainView';
import { getCookie, setCookie } from './utils/cookies';
import ExportView from './components/ExportView';
import { LoraModelConfig } from './types';

// Helper to get a number from a cookie or return a default value.
const getNumberFromCookie = (cookieName: string, defaultValue: number): number => {
    const cookieValue = getCookie(cookieName);
    if (cookieValue !== null) {
        const num = parseFloat(cookieValue);
        if (!isNaN(num)) {
            return num;
        }
    }
    return defaultValue;
};

// Helper for states that can be a number or an empty string.
const getNumberOrEmptyFromCookie = (cookieName: string, defaultValue: number): number | '' => {
    const cookieValue = getCookie(cookieName);
    if (cookieValue === null) {
        return defaultValue;
    }
    if (cookieValue === '') {
        return '';
    }
    const num = parseInt(cookieValue, 10);
    return isNaN(num) ? defaultValue : num;
};

const App: React.FC = () => {
    // State for Inference Tab, initialized from cookies with fallbacks.
    const [prompt, setPrompt] = useState<string>(() => getCookie(COOKIE_PROMPT) || '');
    const [negativePrompt, setNegativePrompt] = useState<string>(() => getCookie(COOKIE_NEGATIVE_PROMPT) || '');
    const [loraModels, setLoraModels] = useState<LoraModelConfig[]>(() => {
        const cookieValue = getCookie(COOKIE_LORA_MODEL);
        if (cookieValue) {
            try {
                const parsed = JSON.parse(cookieValue);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    // Basic validation to ensure it's in the expected format
                    if (typeof parsed[0].model === 'string' && typeof parsed[0].weight === 'string') {
                        return parsed;
                    }
                }
            } catch (e) {
                // If parsing fails, it's likely the old string format.
                // Migrate it to the new structure.
                return [{ model: cookieValue, weight: '' }];
            }
        }
        // Default to one empty LoRA entry
        return [{ model: '', weight: '' }];
    });
    const [width, setWidth] = useState<number | ''>(() => getNumberOrEmptyFromCookie(COOKIE_WIDTH, DEFAULT_WIDTH));
    const [height, setHeight] = useState<number | ''>(() => getNumberOrEmptyFromCookie(COOKIE_HEIGHT, DEFAULT_HEIGHT));
    const [seed, setSeed] = useState<number | null>(() => {
        const cookieSeed = getCookie(COOKIE_SEED);
        if (cookieSeed === 'null') return null;
        if (cookieSeed) {
            const num = parseInt(cookieSeed, 10);
            return isNaN(num) ? Math.floor(Math.random() * 2**32) : num;
        }
        return Math.floor(Math.random() * 2**32);
    });
    const [alwaysRandomSeed, setAlwaysRandomSeed] = useState<boolean>(() => getCookie(COOKIE_ALWAYS_RANDOM_SEED) === 'true');
    const [steps, setSteps] = useState<number>(() => getNumberFromCookie(COOKIE_STEPS, DEFAULT_STEPS));
    const [guidanceScale, setGuidanceScale] = useState<number>(() => getNumberFromCookie(COOKIE_GUIDANCE_SCALE, DEFAULT_GUIDANCE));
    const [batchSize, setBatchSize] = useState<number | ''>(() => getNumberOrEmptyFromCookie(COOKIE_BATCH_SIZE, 1));
    const [inferenceCount, setInferenceCount] = useState<number | ''>(() => getNumberOrEmptyFromCookie(COOKIE_INFERENCE_COUNT, 1));
    
    const [generatedImages, setGeneratedImages] = useState<string[] | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<string | null>(null);

    // State for backend settings
    const [backendMode, setBackendMode] = useState<'combined' | 'dedicated'>(() => (getCookie(COOKIE_BACKEND_MODE) as 'combined' | 'dedicated') || 'combined');
    const [dedicatedDomain, setDedicatedDomain] = useState<string>(() => getCookie(COOKIE_DEDICATED_DOMAIN) || '');

    // State for active tab, also persisted.
    const [activeTab, setActiveTab] = useState<Tab>(() => (getCookie(COOKIE_ACTIVE_TAB) as Tab) || 'inference');

    // Effects to save state to cookies on change.
    useEffect(() => { setCookie(COOKIE_PROMPT, prompt, COOKIE_EXPIRATION_DAYS); }, [prompt]);
    useEffect(() => { setCookie(COOKIE_NEGATIVE_PROMPT, negativePrompt, COOKIE_EXPIRATION_DAYS); }, [negativePrompt]);
    useEffect(() => { setCookie(COOKIE_LORA_MODEL, JSON.stringify(loraModels), COOKIE_EXPIRATION_DAYS); }, [loraModels]);
    useEffect(() => { setCookie(COOKIE_WIDTH, String(width), COOKIE_EXPIRATION_DAYS); }, [width]);
    useEffect(() => { setCookie(COOKIE_HEIGHT, String(height), COOKIE_EXPIRATION_DAYS); }, [height]);
    useEffect(() => { setCookie(COOKIE_SEED, seed, COOKIE_EXPIRATION_DAYS); }, [seed]);
    useEffect(() => { setCookie(COOKIE_ALWAYS_RANDOM_SEED, String(alwaysRandomSeed), COOKIE_EXPIRATION_DAYS); }, [alwaysRandomSeed]);
    useEffect(() => { setCookie(COOKIE_STEPS, steps, COOKIE_EXPIRATION_DAYS); }, [steps]);
    useEffect(() => { setCookie(COOKIE_GUIDANCE_SCALE, guidanceScale, COOKIE_EXPIRATION_DAYS); }, [guidanceScale]);
    useEffect(() => { setCookie(COOKIE_BATCH_SIZE, String(batchSize), COOKIE_EXPIRATION_DAYS); }, [batchSize]);
    useEffect(() => { setCookie(COOKIE_INFERENCE_COUNT, String(inferenceCount), COOKIE_EXPIRATION_DAYS); }, [inferenceCount]);
    useEffect(() => { setCookie(COOKIE_ACTIVE_TAB, activeTab, COOKIE_EXPIRATION_DAYS); }, [activeTab]);
    useEffect(() => { setCookie(COOKIE_BACKEND_MODE, backendMode, COOKIE_EXPIRATION_DAYS); }, [backendMode]);
    useEffect(() => { setCookie(COOKIE_DEDICATED_DOMAIN, dedicatedDomain, COOKIE_EXPIRATION_DAYS); }, [dedicatedDomain]);


    // When generating multiple images, the seed must be random.
    useEffect(() => {
        const numericBatchSize = batchSize === '' ? 1 : Number(batchSize);
        const numericInferenceCount = inferenceCount === '' ? 1 : Number(inferenceCount);

        if (numericBatchSize > 1 || numericInferenceCount > 1) {
            if (seed !== null) {
                setSeed(null);
            }
        }
    }, [batchSize, inferenceCount, seed]);

    const handleGenerate = useCallback(async () => {
        if (isLoading) return;

        setIsLoading(true);
        setError(null);
        setGeneratedImages([]);
        setProgress(null);

        const seedForGeneration = alwaysRandomSeed
            ? Math.floor(Math.random() * 2**32)
            : seed;

        const handleNewImage = (imageUrl: string) => {
            setGeneratedImages(prevImages => [...(prevImages || []), imageUrl]);
        };

        try {
            await generateImage(
                prompt,
                negativePrompt,
                width || DEFAULT_WIDTH,
                height || DEFAULT_HEIGHT,
                steps,
                guidanceScale,
                seedForGeneration,
                batchSize || 1,
                inferenceCount || 1,
                setProgress,
                handleNewImage
            );
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('An unexpected error occurred.');
            }
        } finally {
            setIsLoading(false);
            setProgress(null);
        }
    }, [isLoading, prompt, negativePrompt, width, height, steps, guidanceScale, seed, batchSize, inferenceCount, alwaysRandomSeed]);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans flex flex-col items-center p-4 sm:p-6 lg:p-8">
            <Header 
                backendMode={backendMode}
                setBackendMode={setBackendMode}
                dedicatedDomain={dedicatedDomain}
                setDedicatedDomain={setDedicatedDomain}
            />
            <main className="w-full max-w-6xl mt-8">
                <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />
                <div className="mt-6">
                    {activeTab === 'inference' && (
                        <div className="flex flex-col lg:flex-row gap-8">
                            <div className="w-full lg:w-1/3 lg:max-w-sm">
                                <ImageControls
                                    prompt={prompt}
                                    setPrompt={setPrompt}
                                    negativePrompt={negativePrompt}
                                    setNegativePrompt={setNegativePrompt}
                                    loraModels={loraModels}
                                    setLoraModels={setLoraModels}
                                    width={width}
                                    setWidth={setWidth}
                                    height={height}
                                    setHeight={setHeight}
                                    seed={seed}
                                    setSeed={setSeed}
                                    alwaysRandomSeed={alwaysRandomSeed}
                                    setAlwaysRandomSeed={setAlwaysRandomSeed}
                                    steps={steps}
                                    setSteps={setSteps}
                                    guidanceScale={guidanceScale}
                                    setGuidanceScale={setGuidanceScale}
                                    batchSize={batchSize}
                                    setBatchSize={setBatchSize}
                                    inferenceCount={inferenceCount}
                                    setInferenceCount={setInferenceCount}
                                    isLoading={isLoading}
                                    onGenerate={handleGenerate}
                                />
                            </div>
                            <div className="w-full lg:w-2/3 flex-1">
                                <ImageDisplay
                                    generatedImages={generatedImages}
                                    isLoading={isLoading}
                                    error={error}
                                    prompt={prompt}
                                    progress={progress}
                                />
                            </div>
                        </div>
                    )}
                    {activeTab === 'label' && <LabelingView />}
                    {activeTab === 'train' && <TrainView />}
                    {activeTab === 'export' && <ExportView />}
                </div>
            </main>
        </div>
    );
};

export default App;
