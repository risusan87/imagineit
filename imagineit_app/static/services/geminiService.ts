
/**
 * Generates an image by making a GET request to the backend API.
 * @param prompt The main prompt.
 * @param negativePrompt The negative prompt.
 * @param width The width of the image.
 * @param height The height of the image.
 * @param steps The number of sampling steps.
 * @param guidanceScale The guidance scale.
 * @param seed The seed for reproducibility.
 * @returns A URL for the generated image blob.
 * @throws An error if the request fails or the response is not a valid image.
 */
export const generateImage = async (
    prompt: string,
    negativePrompt: string,
    width: number,
    height: number,
    steps: number,
    guidanceScale: number,
    seed: number | null
): Promise<string> => {
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

        const imageBlob = await response.blob();

        if (!imageBlob.type.startsWith('image/')) {
            throw new Error("Backend did not return a valid image. Please check the API response.");
        }
        
        return URL.createObjectURL(imageBlob);

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


/**
 * Fetches an unlabeled image from the backend.
 * @param id The ID of the image to fetch.
 * @returns An object with the image URL and ID, or null if no image is found.
 */
export const fetchUnlabeledImage = async (id: number): Promise<{ url: string; id: number } | null> => {
    const url = `/api/v1/unlabeled/${id}`;
    try {
        const response = await fetch(url);

        if (response.status === 404) {
            return null; // No more images
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch image with status ${response.status}`);
        }

        const imageBlob = await response.blob();
        if (!imageBlob.type.startsWith('image/')) {
            throw new Error("API did not return a valid image.");
        }

        return { url: URL.createObjectURL(imageBlob), id };

    } catch (error) {
        console.error("Fetch unlabeled image failed:", error);
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
export const submitLabel = async (id: number, prompt: string, negativePrompt: string): Promise<void> => {
    const url = `/api/v1/label/`;
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
