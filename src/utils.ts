import { readdir } from 'node:fs/promises';
import type { Listing } from './types';

export async function directoryExists(path: string) {
  try {
    await readdir(path);
  } catch (err) {
    return false;
  }
  return true;
}

export function getRepoSlug(url: string) {
  return new URL(url).pathname.slice(1).replace('.git', '');
}

export function getAlertSlug(repoSlug: string, listing: Listing) {
  return `${repoSlug}--${listing.company_name.replace(' ', '')}--${listing.id}`;
}
