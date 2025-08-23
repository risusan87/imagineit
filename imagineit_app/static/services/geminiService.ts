import { getCookie } from '../utils/cookies';
import { COOKIE_BACKEND_MODE, COOKIE_DEDICATED_DOMAIN } from '../constants';
import { LoraModelConfig } from '../types';

/**
 * Determines the base URL for API requests based on user settings.
 * Reads from cookies to decide whether to use relative paths (combined)
 * or a full URL (dedicated domain).
 * @returns The base URL string, or an empty string for relative paths.
 */
const getApiBaseUrl = (): string => {
    const mode = getCookie(COOKIE_BACKEND_MODE);
    if (mode === 'dedicated') {
        const domain = getCookie(COOKIE_DEDICATED_DOMAIN);
        // Basic validation for the domain
        if (domain && (domain.startsWith('http://') || domain.startsWith('https://'))) {
             // Remove trailing slash if present
            return domain.replace(/\/$/, '');
        }
    }
    return ''; // For combined mode, use relative paths
};

export const pollProgress = async (reference: string, onProgress: (progress: string) => void): Promise<string[]> => {
    const baseUrl = getApiBaseUrl();
    const progressUrl = `${baseUrl}/api/v1/imagine/progress/${reference}`;
    
    const pollTimeout = 300000; // 5 minutes
    // Polling interval is set to 1 second (1000ms) as requested for status updates.
    const pollInterval = 1000; // 1 second
    const startTime = Date.now();

    while (Date.now() - startTime < pollTimeout) {
        try {
            const response = await fetch(progressUrl);
            if (!response.ok) {
                let errorMessage = `Progress check failed with status ${response.status}`;
                 try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorMessage;
                } catch (e) {
                    // Ignore if response body is not JSON or empty
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            
            if (data.status === 'completed') {
                const result = data.result;
                if (Array.isArray(result)) {
                    return result;
                } else if (typeof result === 'string') {
                    return [result];
                } else {
                    throw new Error("Invalid result format from progress API.");
                }
            } else if (data.status && data.status.startsWith('in_progress')) {
                onProgress(data.status);
            } else if (data.status === 'failed') {
                 throw new Error(data.result || 'Image generation failed on the backend.');
            }
        } catch (error) {
            console.error("Polling failed:", error);
            if (error instanceof TypeError) {
                 throw new Error(`Backend communication failed during progress check. Is the server running?`);
            }
            if (error instanceof Error) {
                throw error;
            }
            throw new Error("An unknown error occurred during progress polling.");
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error("Image generation timed out.");
};


/**
 * Initiates an image generation job and returns the references for polling.
 * @param prompt The main prompt.
 * @param negativePrompt The negative prompt.
 * @param width The width of the image.
 * @param height The height of the image.
 * @param steps The number of sampling steps.
 * @param guidanceScale The guidance scale.
 * @param seed The seed for reproducibility.
 * @param batchSize The number of images to generate in parallel on the backend.
 * @param inferenceCount The total number of images to generate.
 * @returns A promise that resolves to an array of string references for the generation jobs.
 * @throws An error if the request fails.
 */
export const initiateGeneration = async (
    prompt: string,
    negativePrompt: string,
    width: number,
    height: number,
    steps: number,
    guidanceScale: number,
    seed: number | null,
    batchSize: number,
    inferenceCount: number
): Promise<string[]> => {
    if (!prompt.trim()) {
        throw new Error("Prompt cannot be empty.");
    }

    const totalImages = batchSize * inferenceCount;

    const params = new URLSearchParams({
        prompt,
        negative_prompt: negativePrompt,
        width: String(width),
        height: String(height),
        num_inference_steps: String(steps),
        guidance_scale: String(guidanceScale),
        inference_size: String(totalImages),
    });

    if (seed !== null && seed >= 0) {
        params.append('seed', String(seed));
    }
    
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/v1/imagine?${params.toString()}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                // Ignore if response body is not JSON or empty
            }
            throw new Error(errorMessage);
        }
        
        const references = await response.json();

        if (!Array.isArray(references) || references.some(r => typeof r !== 'string')) {
            throw new Error("Backend did not return a valid list of references for image generation.");
        }

        return references;

    } catch (error) {
        console.error("Image generation failed:", error);
        if (error instanceof TypeError) {
             throw new Error(`Backend communication failed. Is the server running?`);
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred during image generation.");
    }
};

interface ImageHashFilters {
    include_filter_prompt: string;
    include_filter_negative_prompt: string;
    exclude_filter_prompt: string;
    exclude_filter_negative_prompt: string;
    labeled: boolean;
}

/**
 * Fetches a list of image hashes based on filter criteria.
 * @param filters The filter parameters.
 * @returns A promise that resolves to an array of image hashes.
 */
export const fetchImageHashes = async (filters: ImageHashFilters): Promise<string[]> => {
    const params = new URLSearchParams();
    if (filters.include_filter_prompt) params.append('include_filter_prompt', filters.include_filter_prompt);
    if (filters.include_filter_negative_prompt) params.append('include_filter_negative_prompt', filters.include_filter_negative_prompt);
    if (filters.exclude_filter_prompt) params.append('exclude_filter_prompt', filters.exclude_filter_prompt);
    if (filters.exclude_filter_negative_prompt) params.append('exclude_filter_negative_prompt', filters.exclude_filter_negative_prompt);
    params.append('labeled', String(filters.labeled));

    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/v1/imghashlist?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image list with status ${response.status}`);
        }
        const data = await response.json();
        return data as string[];
    } catch (error) {
        console.error("Fetch image hashes failed:", error);
        if (error instanceof TypeError) {
             throw new Error(`Backend communication failed. Is the server running?`);
        }
        throw error;
    }
};

/**
 * Fetches a single image by its hash ID.
 * @param id The hash ID of the image.
 * @param level The compression level for the image (0 for full size).
 * @param signal An optional AbortSignal to cancel the request.
 * @returns A promise that resolves to a blob URL of the image.
 */
export const fetchImageById = async (id: string, level: number = 0, signal?: AbortSignal): Promise<string> => {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/v1/images/${id}?compression_level=${level}`;
    try {
        const response = await fetch(url, { signal });
        if (!response.ok) {
            throw new Error(`Failed to fetch image with status ${response.status}`);
        }
        const imageBlob = await response.blob();
        if (!imageBlob.type.startsWith('image/')) {
            throw new Error("API did not return a valid image.");
        }
        return URL.createObjectURL(imageBlob);
    } catch (error) {
        // Don't log AbortError as a failure, it's an expected cancellation.
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
            console.error("Fetch image by ID failed:", error);
        }
        
        if (error instanceof TypeError) {
             throw new Error(`Backend communication failed. Is the server running?`);
        }
        throw error;
    }
};


/**
 * Fetches the stored label for an image.
 * @param hash The hash ID of the image.
 * @returns A promise that resolves to the label string, or an empty string if not labeled.
 */
export const fetchImageLabel = async (hash: string): Promise<string> => {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/v1/${hash}/label`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            // It's possible an unlabeled image returns 404, treat it as empty
            if (response.status === 404) {
                return '';
            }
            throw new Error(`Failed to fetch label with status ${response.status}`);
        }
        const data = await response.json();
        return data.label || '';
    } catch (error) {
        console.error(`Fetch image label for ${hash} failed:`, error);
        if (error instanceof TypeError) {
             throw new Error(`Backend communication failed. Is the server running?`);
        }
        throw error;
    }
};

/**
 * Fetches the original prompt for an image.
 * @param hash The hash ID of the image.
 * @returns A promise that resolves to the original prompt string.
 */
export const fetchImagePrompt = async (hash: string): Promise<string> => {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/v1/${hash}/prompt`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch prompt with status ${response.status}`);
        }
        const data = await response.json();
        return data.prompt || '';
    } catch (error) {
        console.error(`Fetch image prompt for ${hash} failed:`, error);
        if (error instanceof TypeError) {
             throw new Error(`Backend communication failed. Is the server running?`);
        }
        throw error;
    }
};

/**
 * Submits a label for an image to the backend.
 * @param id The ID of the image being labeled.
 * @param label The positive label prompt.
 */
export const submitLabel = async (id: string, label: string): Promise<void> => {
    const baseUrl = getApiBaseUrl();
    const params = new URLSearchParams({ label });
    const url = `${baseUrl}/api/v1/${id}/label?${params.toString()}`;

    try {
        const response = await fetch(url, {
            method: 'PUT',
        });

        if (!response.ok) {
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                // Ignore if response body is not JSON or empty
            }
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error("Submit label failed:", error);
        if (error instanceof TypeError) {
             throw new Error(`Backend communication failed. Is the server running?`);
        }
        throw error;
    }
};

/**
 * Deletes an image from the backend.
 * @param hash The hash ID of the image to delete.
 */
export const deleteImage = async (hash: string): Promise<void> => {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/v1/${hash}/image`;

    try {
        const response = await fetch(url, {
            method: 'DELETE',
        });

        if (!response.ok) {
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorData.error || errorMessage;
            } catch (e) {
                // Ignore if response body is not JSON or empty
            }
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error("Delete image failed:", error);
        if (error instanceof TypeError) {
             throw new Error(`Backend communication failed. Is the server running?`);
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred during image deletion.");
    }
};

/**
 * Mounts one or more LoRA models on the backend via a POST request.
 * @param lorasConfig An array of LoRA model configurations.
 * @returns A promise that resolves to an object with a success status.
 */
export const mountLora = async (lorasConfig: LoraModelConfig[]): Promise<{ status: string }> => {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/v1/lora-mount`;

    const modelsToLoad = lorasConfig.filter(l => l.model.trim() !== '');
    if (modelsToLoad.length === 0) {
        throw new Error("No LoRA models specified to load.");
    }

    const hasWeights = modelsToLoad.some(l => l.weight.trim() !== '');

    const loras = modelsToLoad.map(l => l.model.trim());
    const payload: { loras: string[]; adapter_weights?: number[] } = { loras };

    if (hasWeights) {
        payload.adapter_weights = modelsToLoad.map(l => {
            const weight = parseFloat(l.weight);
            return isNaN(weight) ? 0 : weight; // Convert to number (float)
        });
    }

    try {
        const response = await fetch(url, {
            method: 'POST', // Use POST to send a structured JSON body
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // Ignore if response is not JSON
            }
            throw new Error(errorMessage);
        }

        return await response.json();

    } catch (error) {
        console.error("Mount LoRA failed:", error);
        if (error instanceof TypeError) {
             throw new Error(`Backend communication failed. Is the server running?`);
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred while mounting the LoRA model.");
    }
};

/**
 * Converts an ArrayBuffer to a hexadecimal string.
 * @param buffer The ArrayBuffer to convert.
 * @returns The resulting hex string.
 */
const bufferToHex = (buffer: ArrayBuffer): string => {
    return [...new Uint8Array(buffer)]
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

/**
 * Saves a trimmed image as training data to the backend.
 * @param width The target width of the image.
 * @param height The target height of the image.
 * @param imageDataUrl The base64 data URL of the cropped image.
 * @returns A promise that resolves to an object containing the new image's reference hash.
 */
export const saveTrainingImage = async (
    width: number,
    height: number,
    imageDataUrl: string
): Promise<{ reference: string }> => {
    const baseUrl = getApiBaseUrl();

    // Convert data URL to blob, then to ArrayBuffer, then to a hex string.
    const responseBlob = await fetch(imageDataUrl);
    const imageBlob = await responseBlob.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    const hexImage = bufferToHex(arrayBuffer);

    const params = new URLSearchParams({
        width: String(width),
        height: String(height),
    });

    const url = `${baseUrl}/api/v1/train/image?${params.toString()}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image: hexImage }),
        });

        if (!response.ok) {
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorData.error || errorMessage;
            } catch (e) {
                // Ignore if response body is not JSON or empty
            }
            throw new Error(errorMessage);
        }

        return await response.json();

    } catch (error) {
        console.error("Save training image failed:", error);
        if (error instanceof TypeError) {
             throw new Error(`Backend communication failed. Is the server running?`);
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred while saving the image.");
    }
};

/**
 * Converts a hex string to an ArrayBuffer.
 * @param hex The hex string to convert.
 * @returns The resulting ArrayBuffer.
 */
const hexToArrayBuffer = (hex: string): ArrayBuffer => {
    if (hex.length % 2 !== 0) {
        throw new Error('Hex string must have an even number of characters');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
};


/**
 * Requests the backend to create a zip archive of specified images.
 * @param collectionName The name for the export collection.
 * @param isTrainingData Flag indicating if the data is for training.
 * @param imageHashes An array of image hashes to include in the zip.
 * @param returnFile Flag indicating if the zip file should be returned in the response.
 * @returns A promise that resolves to an object containing the status and an optional file URL.
 */
export const createZipFile = async (
    collectionName: string,
    isTrainingData: boolean,
    imageHashes: string[],
    returnFile: boolean
): Promise<{ status: string; fileUrl?: string }> => {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/v1/zipfile`;

    const payload = {
        zip_file_name: collectionName,
        is_train_data: isTrainingData,
        img_hashes: imageHashes,
        return_file: returnFile,
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const responseData = await response.json();

        if (!response.ok) {
            let errorMessage = `API request failed with status ${response.status}`;
            errorMessage = responseData.detail || errorMessage;
            throw new Error(errorMessage);
        }
        
        if (responseData.status !== 'success') {
            throw new Error('API returned a non-success status.');
        }

        if (returnFile) {
            if (!responseData.file || typeof responseData.file !== 'string') {
                throw new Error('API was expected to return a file, but did not.');
            }
            const arrayBuffer = hexToArrayBuffer(responseData.file);
            const blob = new Blob([arrayBuffer], { type: 'application/zip' });
            const fileUrl = URL.createObjectURL(blob);
            return { status: 'success', fileUrl };
        }

        return { status: 'success' };

    } catch (error) {
        console.error("Create zip file failed:", error);
        if (error instanceof TypeError) {
             throw new Error(`Backend communication failed. Is the server running?`);
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred during zip file creation.");
    }
};