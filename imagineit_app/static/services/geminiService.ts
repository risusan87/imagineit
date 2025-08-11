
const API_BASE_URL = 'http://localhost:8000';

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

    const url = `${API_BASE_URL}/api/v1/imagine?${params.toString()}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                // Try to parse a more specific error message from the backend
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
        
        // Create a local URL for the received image data
        return URL.createObjectURL(imageBlob);

    } catch (error) {
        console.error("Image generation failed:", error);
        if (error instanceof TypeError) {
             throw new Error(`Backend communication failed. Is the server running at ${API_BASE_URL}?` + error.message);
        }
        if (error instanceof Error) {
            throw error; // Re-throw the specific error from the API response
        }
        throw new Error("An unknown error occurred during image generation.");
    }
};
