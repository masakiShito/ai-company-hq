import { readFile } from 'node:fs/promises';

import { z } from 'zod';

export const RepositorySchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
    'repository must be in owner/name format',
  );

export const CompanyConfigSchema = z
  .object({
    name: z.string().min(1),
    timezone: z.literal('Asia/Tokyo'),
    repos: z.array(RepositorySchema).min(1),
  })
  .strict();

export type CompanyConfig = z.infer<typeof CompanyConfigSchema>;

export async function loadCompanyConfig(
  configPath = 'company.config.json',
): Promise<CompanyConfig> {
  const contents = await readFile(configPath, 'utf8');
  const parsed: unknown = JSON.parse(contents);

  return CompanyConfigSchema.parse(parsed);
}
