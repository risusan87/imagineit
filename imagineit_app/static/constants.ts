// Stable Diffusion Parameters
export const DEFAULT_STEPS = 28;
export const MIN_STEPS = 1;
export const MAX_STEPS = 50;

export const DEFAULT_GUIDANCE = 5.0;
export const MIN_GUIDANCE = 1;
export const MAX_GUIDANCE = 20;

// Image Dimensions
export const DEFAULT_WIDTH = 512;
export const DEFAULT_HEIGHT = 512;
export const MIN_DIMENSION = 8;
export const MAX_DIMENSION = 2048;
export const DIMENSION_STEP = 8;

export interface AspectRatio {
    width: number;
    height: number;
    ratio: string;
}

export const PREDEFINED_ASPECT_RATIOS: { name: string; ratios: AspectRatio[] }[] = [
    {
        name: 'Square',
        ratios: [
            { width: 1024, height: 1024, ratio: '1:1' },
        ]
    },
    {
        name: 'Landscape',
        ratios: [
            { width: 1152, height: 896, ratio: '9:7' },
            { width: 1216, height: 832, ratio: '3:2' },
            { width: 1344, height: 768, ratio: '7:4' },
            { width: 1536, height: 640, ratio: '12:5' },
        ]
    },
    {
        name: 'Portrait',
        ratios: [
            { width: 896, height: 1152, ratio: '7:9' },
            { width: 832, height: 1216, ratio: '2:3' },
            { width: 768, height: 1344, ratio: '4:7' },
            { width: 640, height: 1536, ratio: '5:12' },
        ]
    }
];

// Cookie Settings
export const COOKIE_DOMAIN = '.share.zrok.io';
export const COOKIE_EXPIRATION_DAYS = 365;

// Cookie Keys
export const COOKIE_PROMPT = 'ai_studio_prompt';
export const COOKIE_NEGATIVE_PROMPT = 'ai_studio_negative_prompt';
export const COOKIE_WIDTH = 'ai_studio_width';
export const COOKIE_HEIGHT = 'ai_studio_height';
export const COOKIE_SEED = 'ai_studio_seed';
export const COOKIE_STEPS = 'ai_studio_steps';
export const COOKIE_GUIDANCE_SCALE = 'ai_studio_guidance_scale';
export const COOKIE_BATCH_SIZE = 'ai_studio_batch_size';
export const COOKIE_INFERENCE_COUNT = 'ai_studio_inference_count';
export const COOKIE_ACTIVE_TAB = 'ai_studio_active_tab';
export const COOKIE_ALWAYS_RANDOM_SEED = 'ai_studio_always_random_seed';
export const COOKIE_LORA_MODEL = 'ai_studio_lora_model';

// Cookie Keys for Backend Settings
export const COOKIE_BACKEND_MODE = 'ai_studio_backend_mode';
export const COOKIE_DEDICATED_DOMAIN = 'ai_studio_dedicated_domain';

// Training Image Settings
export const TRAINING_IMAGE_FORMAT = 'image/png';