/**
 * Generates an image by making a GET request to the backend API.
 * @param prompt The main prompt.
 * @param negativePrompt The negative prompt.
 * @param width The width of the image.
 * @param height The height of the image.
 * @param steps The number of sampling steps.
 * @param guidanceScale The guidance scale.
 * @param seed The seed for reproducibility.
 * @param batchSize The number of images to generate in parallel on the backend.
 * @param inferenceCount The total number of images to generate.
 * @returns An array of URLs for the generated image blobs.
 * @throws An error if the request fails or the response is not a valid image.
 */
export const generateImage = async (
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

    const params = new URLSearchParams({
        prompt,
        negative_prompt: negativePrompt,
        width: String(width),
        height: String(height),
        steps: String(steps),
        guidance_scale: String(guidanceScale),
        batch_size: String(batchSize),
        inference_size: String(inferenceCount),
    });

    if (seed !== null && seed >= 0) {
        params.append('seed', String(seed));
    }

    const url = `/api/v1/imagine?${params.toString()}`;

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
        
        const imageHashes = await response.json();

        if (!Array.isArray(imageHashes)) {
            throw new Error("Backend did not return a valid list of images. Please check the API response.");
        }
        
        if (imageHashes.length === 0) {
            return [];
        }

        // Fetch all images concurrently from their hashes
        const imageUrls = await Promise.all(
            imageHashes.map(hash => fetchImageById(hash))
        );
        
        return imageUrls;

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

    const url = `/api/v1/imghashlist?${params.toString()}`;

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
 * @returns A promise that resolves to a blob URL of the image.
 */
export const fetchImageById = async (id: string): Promise<string> => {
    const url = `/api/v1/image/${id}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image with status ${response.status}`);
        }
        const imageBlob = await response.blob();
        if (!imageBlob.type.startsWith('image/')) {
            throw new Error("API did not return a valid image.");
        }
        return URL.createObjectURL(imageBlob);
    } catch (error) {
        console.error("Fetch image by ID failed:", error);
        if (error instanceof TypeError) {
             throw new Error(`Backend communication failed. Is the server running?`);
        }
        throw error;
    }
};


/**
 * Submits a label for an image to the backend.
 * @param id The ID of the image being labeled.
 * @param prompt The positive label prompt.
 * @param negativePrompt The negative label prompt.
 */
export const submitLabel = async (id: string, prompt: string, negativePrompt: string): Promise<void> => {
    const url = `/api/v1/label`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id,
                prompt,
                negative_prompt: negativePrompt
            }),
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