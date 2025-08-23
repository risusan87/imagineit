export interface LoraModelConfig {
  model: string;
  weight: string; // Kept as string for flexible user input (e.g., "0.")
}

export type ImageGenerationStatus = 'queued' | 'generating' | 'completed' | 'failed';

export interface ImageGeneration {
  reference: string;
  imageUrl: string | null;
  status: ImageGenerationStatus;
  progressText?: string;
  hash?: string;
}
