import { readdir } from 'node:fs/promises';

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
