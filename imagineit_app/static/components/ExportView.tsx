

import React, { useState, useEffect } from 'react';
import { fetchImageHashes, fetchImageById, createZipFile } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import ErrorDisplay from './ErrorDisplay';

// Reusable component for selectable image thumbnails
const SelectableImageThumbnail: React.FC<{
    hash: string;
    url?: string;
    isSelected: boolean;
    onSelect: (hash: string) => void;
}> = ({ hash, url, isSelected, onSelect }) => {
    return (
        <div 
            className="relative cursor-pointer aspect-square bg-gray-700 rounded-lg overflow-hidden group"
            onClick={() => onSelect(hash)}
            role="checkbox"
            aria-checked={isSelected}
            tabIndex={0}
            onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && onSelect(hash)}
        >
            {url ? (
                <img src={url} alt={`Image ${hash}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
            ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <svg className="animate-spin h-8 w-8 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </div>
            )}
            <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-purple-600/50' : 'bg-black/50 opacity-0 group-hover:opacity-100'}`}></div>
            <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 transition-all ${isSelected ? 'bg-purple-500 border-white' : 'bg-gray-800/50 border-gray-400'}`}>
                {isSelected && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                )}
            </div>
        </div>
    );
};

const ExportView: React.FC = () => {
    const [collectionName, setCollectionName] = useState('');
    const [filterPrompt, setFilterPrompt] = useState('');
    const [onlyLabeled, setOnlyLabeled] = useState(false);
    const [isTrainingData, setIsTrainingData] = useState(false);
    const [downloadFile, setDownloadFile] = useState(true);
    
    const [imageHashes, setImageHashes] = useState<string[]>([]);
    const [loadedImages, setLoadedImages] = useState<Map<string, string>>(new Map());
    const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
    
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    
    const [exportState, setExportState] = useState<'idle' | 'exporting' | 'exported' | 'error'>('idle');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);

    // Fetch images when hashes are available
    useEffect(() => {
        imageHashes.forEach(hash => {
            if (!loadedImages.has(hash)) {
                fetchImageById(hash, 3) // Use level 3 for smaller thumbnails in the grid
                    .then(url => setLoadedImages(prev => new Map(prev).set(hash, url)))
                    .catch(err => console.error(`Failed to load image ${hash}`, err));
            }
        });
    }, [imageHashes, loadedImages]);

    // Clean up blobs
    useEffect(() => {
        const currentLoadedImages = loadedImages;
        return () => {
            currentLoadedImages.forEach(url => URL.revokeObjectURL(url));
        };
    }, [loadedImages]);

    const handleSearch = async () => {
        setIsSearching(true);
        setSearchError(null);
        setImageHashes([]);
        setSelectedHashes(new Set());
        setExportState('idle');
        setDownloadUrl(null);
        setExportError(null);

        try {
            const hashes = await fetchImageHashes({
                include_filter_prompt: filterPrompt,
                include_filter_negative_prompt: '',
                exclude_filter_prompt: '',
                exclude_filter_negative_prompt: '',
                labeled: onlyLabeled
            });
            setImageHashes(hashes);
        } catch (err) {
            setSearchError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsSearching(false);
        }
    };

    const handleToggleSelect = (hash: string) => {
        setSelectedHashes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(hash)) {
                newSet.delete(hash);
            } else {
                newSet.add(hash);
            }
            return newSet;
        });
    };
    
    const handleSelectAll = () => {
        setSelectedHashes(new Set(imageHashes));
    };
    
    const handleDeselectAll = () => {
        setSelectedHashes(new Set());
    };

    const handleExport = async () => {
        if (!collectionName.trim() || selectedHashes.size === 0) {
            return;
        }
        setExportState('exporting');
        setExportError(null);
        setDownloadUrl(null);
        
        try {
            const result = await createZipFile(
                collectionName,
                isTrainingData,
                Array.from(selectedHashes),
                downloadFile
            );

            if (result.status === 'success') {
                if (downloadFile) {
                    if(result.fileUrl) {
                        setDownloadUrl(result.fileUrl);
                    } else {
                         throw new Error('Export succeeded but did not return a file URL for download.');
                    }
                }
                setExportState('exported');
            } else {
                throw new Error('Export failed with a non-success status.');
            }

        } catch (err) {
            setExportError(err instanceof Error ? err.message : 'Failed to create export.');
            setExportState('error');
        }
    };
    
    const isExportDisabled = exportState === 'exporting' || !collectionName.trim() || selectedHashes.size === 0;

    return (
        <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Column: Controls */}
            <div className="w-full lg:w-1/3 lg:max-w-sm">
                 <div className="bg-gray-800/50 p-6 rounded-2xl shadow-lg space-y-6 sticky top-8">
                    {/* Search Section */}
                    <div>
                        <h3 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-3">1. Find Images</h3>
                        <div className="space-y-4 pt-2">
                             <div>
                                <label htmlFor="search-prompt" className="block text-sm font-medium text-gray-300 mb-1">Search by prompt</label>
                                <input
                                    id="search-prompt"
                                    type="text"
                                    className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 disabled:opacity-50"
                                    value={filterPrompt}
                                    onChange={(e) => setFilterPrompt(e.target.value)}
                                    disabled={isSearching}
                                    placeholder="e.g., a cat wearing a hat"
                                />
                            </div>
                            <div className="flex items-center">
                                <input
                                    id="only-labeled"
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-600 disabled:opacity-50"
                                    checked={onlyLabeled}
                                    onChange={e => setOnlyLabeled(e.target.checked)}
                                    disabled={isSearching}
                                />
                                <label htmlFor="only-labeled" className="ml-2 text-sm font-medium text-gray-300 select-none">Show only labeled images</label>
                            </div>
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={isSearching}
                            className="w-full mt-6 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold py-3 px-4 rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSearching ? 'Searching...' : 'Search'}
                        </button>
                    </div>

                    {/* Export Section */}
                    <div>
                        <h3 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-3">2. Create Export</h3>
                         <div className="space-y-4 pt-2">
                            <div>
                                <label htmlFor="collection-name" className="block text-sm font-medium text-gray-300 mb-1">Collection Name</label>
                                <input
                                    id="collection-name"
                                    type="text"
                                    className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200 disabled:opacity-50"
                                    value={collectionName}
                                    onChange={(e) => setCollectionName(e.target.value)}
                                    disabled={exportState === 'exporting'}
                                    placeholder="e.g., cat-portraits-v1"
                                />
                            </div>
                             <div className="space-y-2">
                                <div className="flex items-center">
                                    <input
                                        id="is-training-data"
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-600 disabled:opacity-50"
                                        checked={isTrainingData}
                                        onChange={e => setIsTrainingData(e.target.checked)}
                                        disabled={exportState === 'exporting'}
                                    />
                                    <label htmlFor="is-training-data" className="ml-2 text-sm font-medium text-gray-300 select-none">Mark as training data</label>
                                </div>
                                <div className="flex items-center">
                                    <input
                                        id="download-file"
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-600 disabled:opacity-50"
                                        checked={downloadFile}
                                        onChange={e => setDownloadFile(e.target.checked)}
                                        disabled={exportState === 'exporting'}
                                    />
                                    <label htmlFor="download-file" className="ml-2 text-sm font-medium text-gray-300 select-none">Download file immediately</label>
                                </div>
                            </div>
                             <div className="text-sm text-gray-300 bg-gray-700/50 p-3 rounded-lg text-center">
                                <span className="font-bold text-lg text-purple-400">{selectedHashes.size}</span> / {imageHashes.length} images selected
                            </div>
                        </div>
                         <button
                            onClick={handleExport}
                            disabled={isExportDisabled}
                            className="w-full mt-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 px-4 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {exportState === 'exporting' ? 'Exporting...' : 'Export Selected Images'}
                        </button>
                        {exportError && <p className="text-red-400 text-sm mt-2">{exportError}</p>}
                    </div>
                    
                    {/* Download Section */}
                    {exportState === 'exported' && (
                        <div>
                            <h3 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-3">3. Result</h3>
                            <div className="bg-green-900/50 border border-green-500 text-green-300 px-4 py-3 rounded-lg text-center">
                                <p className="font-semibold">Export created successfully!</p>
                                {downloadFile && <p className="text-sm">Collection: "{collectionName}"</p>}
                                {!downloadFile && <p className="text-sm">Your file is ready on the server.</p>}
                            </div>
                            {downloadFile && downloadUrl && (
                                <a
                                    href={downloadUrl}
                                    download={`${collectionName || 'export'}.zip`}
                                    className="block w-full text-center mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                                >
                                    Download ZIP
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Image Gallery */}
            <div className="w-full lg:w-2/3 flex-1 bg-gray-800/50 rounded-2xl p-4 min-h-[550px] lg:h-[calc(100vh-4rem)] overflow-y-auto">
                 {isSearching && <div className="h-full flex items-center justify-center"><LoadingSpinner /></div>}
                 {searchError && <div className="h-full flex items-center justify-center"><ErrorDisplay error={searchError} /></div>}
                 {!isSearching && !searchError && (
                    <>
                        {imageHashes.length > 0 ? (
                            <>
                                <div className="flex justify-between items-center mb-4 sticky top-0 bg-gray-800/80 backdrop-blur-sm py-2 z-10">
                                    <h3 className="text-lg font-semibold text-white">Search Results ({imageHashes.length})</h3>
                                    <div className="space-x-2">
                                        <button onClick={handleSelectAll} className="text-sm text-purple-400 hover:underline">Select All</button>
                                        <button onClick={handleDeselectAll} className="text-sm text-purple-400 hover:underline">Deselect All</button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {imageHashes.map(hash => (
                                        <SelectableImageThumbnail 
                                            key={hash}
                                            hash={hash}
                                            url={loadedImages.get(hash)}
                                            isSelected={selectedHashes.has(hash)}
                                            onSelect={handleToggleSelect}
                                        />
                                    ))}
                                </div>
                            </>
                        ) : (
                             <div className="h-full flex flex-col items-center justify-center text-center text-gray-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <h3 className="text-xl font-semibold text-gray-400">Find images to export</h3>
                                <p className="mt-1">Use the search bar to find images to include in your dataset.</p>
                            </div>
                        )}
                    </>
                 )}
            </div>
        </div>
    );
};

export default ExportView;
