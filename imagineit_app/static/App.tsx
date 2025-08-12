
import React, { useState, useCallback } from 'react';
import { DEFAULT_STEPS, DEFAULT_GUIDANCE, DEFAULT_WIDTH, DEFAULT_HEIGHT } from './constants';
import { generateImage } from './services/geminiService';
import Header from './components/Header';
import ImageControls from './components/ImageControls';
import ImageDisplay from './components/ImageDisplay';
import Tabs, { Tab } from './components/Tabs';
import LabelingView from './components/LabelingView';
import TrainView from './components/TrainView';

const App: React.FC = () => {
    // State for Inference Tab
    const [prompt, setPrompt] = useState<string>('');
    const [negativePrompt, setNegativePrompt] = useState<string>('');
    const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
    const [height, setHeight] = useState<number>(DEFAULT_HEIGHT);
    const [seed, setSeed] = useState<number | null>(null);
    const [steps, setSteps] = useState<number>(DEFAULT_STEPS);
    const [guidanceScale, setGuidanceScale] = useState<number>(DEFAULT_GUIDANCE);
    const [batchSize, setBatchSize] = useState<number>(1);
    const [inferenceCount, setInferenceCount] = useState<number>(1);
    const [generatedImages, setGeneratedImages] = useState<string[] | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // State for active tab
    const [activeTab, setActiveTab] = useState<Tab>('inference');

    const handleGenerate = useCallback(async () => {
        if (isLoading) return;

        setIsLoading(true);
        setError(null);
        setGeneratedImages(null);

        try {
            const imageUrls = await generateImage(
                prompt,
                negativePrompt,
                width,
                height,
                steps,
                guidanceScale,
                seed,
                batchSize,
                inferenceCount
            );
            setGeneratedImages(imageUrls);
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('An unexpected error occurred.');
            }
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, prompt, negativePrompt, width, height, steps, guidanceScale, seed, batchSize, inferenceCount]);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans flex flex-col items-center p-4 sm:p-6 lg:p-8">
            <Header />
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
                                    width={width}
                                    setWidth={setWidth}
                                    height={height}
                                    setHeight={setHeight}
                                    seed={seed}
                                    setSeed={setSeed}
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
                                />
                            </div>
                        </div>
                    )}
                    {activeTab === 'label' && <LabelingView />}
                    {activeTab === 'train' && <TrainView />}
                </div>
            </main>
        </div>
    );
};

export default App;