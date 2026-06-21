import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const items = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/items' }),
  schema: z.object({
    name: z.string(),
    year: z.number(),
    era: z.string(),
    tagline: z.string(),
    image: z.string().optional(),
    historicalContext: z.string(),
    personalStory: z.string(),
  }),
});

export const collections = { items };
