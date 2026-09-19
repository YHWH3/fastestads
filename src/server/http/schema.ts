import { z } from 'zod';

// Reject strings containing U+0000 (written via fromCharCode so no literal NUL
// byte ever lands in source).
const noNul = (s: string) => !s.includes(String.fromCharCode(0));

export const semanticRequestSchema = z
  .object({
    platform: z.literal('google-ads'),
    format: z.literal('rsa'),
    headlines: z.array(z.string().max(200).refine(noNul, 'contains NUL character')).max(15),
    descriptions: z.array(z.string().max(400).refine(noNul, 'contains NUL character')).max(4),
    keyword: z.string().max(120).refine(noNul, 'contains NUL character').optional(),
  })
  .strict();

export type SemanticRequestBody = z.infer<typeof semanticRequestSchema>;
