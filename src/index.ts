import { Cron } from 'croner';
import { simpleGit as git } from 'simple-git';
import { GIT_REPOS } from './data';
import { directoryExists, getRepoSlug } from './utils';
import { rimraf } from 'rimraf';
import type { Listing } from './types';

const { CRON_PATTERN, DISCORD_WEBHOOK_URL } = process.env;
if (!(CRON_PATTERN && DISCORD_WEBHOOK_URL)) {
  throw new Error('One or more environment variables are missing.');
}

async function updateGitRepos() {
  for (const repoUrl of GIT_REPOS) {
    const repoSlug = getRepoSlug(repoUrl);
    const localPath = `./cache/repos/${repoSlug.replace('/', '-')}`;

    if (await directoryExists(localPath)) {
      try {
        const pullResult = await git(localPath).pull();

        console.log(
          'Pulled',
          repoSlug,
          '(',
          pullResult.summary.changes,
          ' changes,',
          pullResult.summary.insertions,
          ' insertions,',
          pullResult.summary.deletions,
          ' deletions )'
        );
      } catch (err) {
        console.error(err);
        console.error(`Failed to pull ${repoSlug}, recloning...`);

        await rimraf(localPath);
        await git().clone(repoUrl, localPath);

        console.log('Cloned', repoSlug, '->', localPath);
      }
    } else {
      await git().clone(repoUrl, localPath);
      console.log('Cloned', repoSlug, '->', localPath);
    }
  }
}

async function getNewListings(
  oldListingsPath: string,
  repoListingsPath: string
) {
  const oldListingFile = Bun.file(oldListingsPath);
  let newListings: Listing[] = [];

  const newListingData: Listing[] = await Bun.file(repoListingsPath).json();

  if (await oldListingFile.exists()) {
    const oldListingData: Listing[] = await oldListingFile.json();

    newListings = newListingData.filter(
      (newListing) =>
        !oldListingData.find((oldListing) => oldListing.id === newListing.id) &&
        newListing.is_visible &&
        newListing.active
    );
  }

  // Save new listings so we can compare them next time
  await Bun.write(oldListingsPath, JSON.stringify(newListingData));

  return newListings;
}

async function sendListingAlert(repoSlug: string, listing: Listing) {
  if (!DISCORD_WEBHOOK_URL) {
    return;
  }
  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `<@&${process.env.DISCORD_MENTION_ROLE_ID}>`,
      embeds: [
        {
          color: 0xffffac33,
          title: '🔔 New Job Listing',
          fields: [
            {
              name: 'Company',
              value:
                listing.company_url !== ''
                  ? `[${listing.company_name}](${listing.company_url})`
                  : listing.company_name,
              inline: true
            },
            {
              name: 'Role',
              value: listing.title,
              inline: true
            },
            {
              name: '\u200b',
              value: '\u200b',
              inline: true
            },
            {
              name: 'Season',
              // biome-ignore format: ugly
              value: 'terms' in listing
                ? listing.terms.join(', ')
                : listing.season,
              inline: true
            },
            {
              name: 'Source',
              value: listing.source,
              inline: true
            },
            {
              name: 'Sponsorship',
              value: listing.sponsorship,
              inline: true
            },
            {
              name: 'Locations',
              value: listing.locations.join(' / '),
              inline: true
            },
            {
              name: 'Posted',
              value: `<t:${listing.date_posted}:R>`,
              inline: true
            },
            {
              name: 'URL',
              value: repoSlug.startsWith('SimplifyJobs')
                ? `https://simplify.jobs/p/${listing.id}`
                : listing.url
            }
          ]
        }
      ]
    })
  });
  if (!response.ok) {
    console.warn(
      'Failed to send listing alert (Status:',
      response.status,
      response.statusText,
      ')'
    );
  }
}

async function checkInternshipListings() {
  console.log('Checking for new internships...');
  await updateGitRepos();

  for (const repoUrl of GIT_REPOS) {
    const repoSlug = getRepoSlug(repoUrl);
    const repoPathSlug = repoSlug.replace('/', '-');

    const newListings = await getNewListings(
      `./cache/listings/${repoPathSlug}.json`,
      `./cache/repos/${repoPathSlug}/.github/scripts/listings.json`
    );

    if (newListings.length) {
      console.log('Found', newListings.length, 'new listings in', repoSlug);

      for (const newListing of newListings) {
        await sendListingAlert(repoSlug, newListing);
      }
    }
  }
}

const job = new Cron(CRON_PATTERN, checkInternshipListings);
console.log('Job started, running on schedule', job.getPattern());
