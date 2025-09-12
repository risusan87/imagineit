export interface LoraModelConfig {
  model: string;
  weight: string; // Kept as string for flexible user input (e.g., "0.")
}

export type ImageGenerationStatus = 'queued' | 'generating' | 'completed' | 'failed';

export interface ImageGeneration {
  id: number; // Unique ID for React keys, corresponds to generation index
  imageUrl: string | null;
  status: ImageGenerationStatus;
  progressText?: string;
  hash?: string;
}
