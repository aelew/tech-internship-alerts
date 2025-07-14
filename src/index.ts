import { Cron } from 'croner';
import { simpleGit as git } from 'simple-git';
import { directoryExists, getRepositorySlug } from './utils';
import { rimraf } from 'rimraf';
import type { Listing } from './types';
import stamp from 'console-stamp';
import { config } from './config';
import type { BunFile } from 'bun';
import { publishNewListing, closePublishedListing } from './discord';
import PQueue from 'p-queue';
import { env } from './env';

stamp(console);

const queue = new PQueue({
  concurrency: 1,
  intervalCap: 1,
  interval: 1000
});

async function updateGitRepositories() {
  const repos = Object.values(config.roleTypes).flatMap((c) => c.repositories);

  for (const url of repos) {
    const slug = getRepositorySlug(url);
    const path = `./data/repos/${slug.replace('/', '-')}`;

    async function clone() {
      console.log(`Cloning ${slug} -> ${path}...`);

      await git().clone(url, path, [
        '--sparse',
        '--depth=1',
        '--filter=blob:none'
      ]);

      await git().cwd(path).raw('sparse-checkout', 'set', '.github/scripts');

      console.log(`Cloned ${slug} -> ${path}...`);
    }

    async function reclone() {
      await rimraf(path);
      await clone();
    }

    if (!(await directoryExists(path))) {
      await clone();
      continue;
    }

    const listingsFile = Bun.file(`${path}/.github/scripts/listings.json`);
    if (!(await listingsFile.exists())) {
      console.log(`Recloning ${slug} (incomplete repo)`);
      await reclone();
      continue;
    }

    try {
      const { summary } = await git().cwd(path).pull();

      if (
        env.NODE_ENV === 'development' &&
        (summary.changes || summary.insertions || summary.deletions)
      ) {
        console.log(
          'Pulled',
          slug,
          `(${summary.changes} changes, ${summary.insertions} insertions, ${summary.deletions} deletions)`
        );
      }
    } catch (error) {
      console.error(`Recloning ${slug} (pull failed)`, error);
      await reclone();
    }
  }
}

async function compareListings(
  localListingsFile: BunFile,
  repoListingsFile: BunFile
) {
  if (!(await repoListingsFile.exists())) {
    return { opened: [], closed: [] };
  }

  const repoListings: Listing[] = await repoListingsFile.json();

  let opened: Listing[] = [];
  const closed: Listing[] = [];

  if (await localListingsFile.exists()) {
    const localListings: Listing[] = await localListingsFile.json();

    opened = repoListings.filter((repoListing) => {
      const localListing = localListings.find(
        (listing) =>
          listing.id === repoListing.id &&
          listing.company_name === repoListing.company_name
      );

      if (!localListing) {
        return repoListing.active && repoListing.is_visible;
      }

      // listing is now inactive or hidden
      if (
        (localListing.active && !repoListing.active) ||
        (localListing.is_visible && !repoListing.is_visible)
      ) {
        closed.push(repoListing);
      }

      return false;
    });
  }

  // save current listings for next comparison
  await Bun.write(localListingsFile, JSON.stringify(repoListings));

  return { opened, closed };
}

async function checkListings() {
  await updateGitRepositories();

  for (const [roleType, { integrations, repositories }] of Object.entries(
    config.roleTypes
  )) {
    for (const url of repositories) {
      const slug = getRepositorySlug(url);
      const pathSlug = slug.replace('/', '-');

      const { opened, closed } = await compareListings(
        Bun.file(`./data/listings/${pathSlug}.json`),
        Bun.file(`./data/repos/${pathSlug}/.github/scripts/listings.json`)
      );

      if (opened.length) {
        console.log(
          `Found ${
            opened.length
          } opened ${roleType.toUpperCase()} listings in ${slug}`
        );

        opened.forEach((listing) => {
          queue
            .add(() => publishNewListing(integrations.discord, slug, listing))
            .catch(console.error);
        });
      }

      if (closed.length) {
        console.log(
          `Found ${
            closed.length
          } closed ${roleType.toUpperCase()} listings in ${slug}`
        );

        closed.forEach((listing) => {
          queue
            .add(() =>
              closePublishedListing(integrations.discord, slug, listing)
            )
            .catch(console.error);
        });
      }
    }
  }
}

const job = new Cron(config.cronPattern, checkListings);
console.log('Cron job started, running on schedule', job.getPattern());

job.trigger();
