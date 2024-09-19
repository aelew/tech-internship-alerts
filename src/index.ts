import { Cron } from 'croner';
import { simpleGit as git } from 'simple-git';
import { GIT_REPOS } from './data';
import { directoryExists, getAlertSlug, getRepoSlug } from './utils';
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
        const { summary } = await git(localPath).pull();

        // biome-ignore format: hard to read
        console.log('Pulled', repoSlug, '(', summary.changes, ' changes,', summary.insertions, ' insertions,', summary.deletions, ' deletions )');
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

async function getListingUpdates(
  oldListingsPath: string,
  repoListingsPath: string
) {
  const oldListingFile = Bun.file(oldListingsPath);
  const repoListingData: Listing[] = await Bun.file(repoListingsPath).json();

  const closedListings: Listing[] = [];
  let openedListings: Listing[] = [];

  if (await oldListingFile.exists()) {
    const oldListingData: Listing[] = await oldListingFile.json();

    openedListings = repoListingData.filter((newListing) => {
      const oldListing = oldListingData.find(
        (ol) =>
          ol.id === newListing.id && ol.company_name === newListing.company_name
      );
      if (!oldListing) {
        return newListing.active && newListing.is_visible;
      }

      const isNowActive =
        newListing.active &&
        newListing.is_visible &&
        ((!oldListing.active && newListing.active) ||
          (!oldListing.is_visible && newListing.is_visible));

      if (isNowActive) {
        return true;
      }

      const isNowInactive =
        (oldListing.active && !newListing.active) ||
        (oldListing.is_visible && !newListing.is_visible);

      // The listing has turned inactive or hidden
      if (isNowInactive) {
        closedListings.push(newListing);
      }

      return false;
    });
  }

  // Save new listings so we can compare them next time
  await Bun.write(oldListingsPath, JSON.stringify(repoListingData));

  return { openedListings, closedListings };
}

async function sendListingAlert(repoSlug: string, listing: Listing) {
  const payload = {
    content: process.env.DISCORD_MENTION_ROLE_ID
      ? `<@&${process.env.DISCORD_MENTION_ROLE_ID}>`
      : '',
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
            // biome-ignore format: hard to read
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
  };

  const response = await fetch(`${DISCORD_WEBHOOK_URL}?wait=true`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    method: 'POST'
  });
  if (!response.ok) {
    console.warn(
      'Failed to send listing alert (Status:',
      response.status,
      response.statusText,
      ')'
    );
  }

  const message = await response.json();

  // Saves the alert message ID so we can edit the message when the listing closes
  const alertsFile = Bun.file('./cache/alerts.json');
  const alertData = (await alertsFile.exists()) ? await alertsFile.json() : {};
  const alertSlug = getAlertSlug(repoSlug, listing);

  alertData[alertSlug] = [
    ...(alertData[alertSlug] || []),
    { messageId: message.id, payload }
  ];

  Bun.write(alertsFile, JSON.stringify(alertData));
}

async function sendClosedListingUpdate(repoSlug: string, listing: Listing) {
  const alertsFile = Bun.file('./cache/alerts.json');
  const alertData = (await alertsFile.exists()) ? await alertsFile.json() : {};
  const alertSlug = getAlertSlug(repoSlug, listing);

  const alerts = alertData[alertSlug];
  if (!alerts) {
    return;
  }

  for (const alert of alerts) {
    await fetch(`${DISCORD_WEBHOOK_URL}/messages/${alert.messageId}`, {
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
      body: JSON.stringify({
        embeds: [
          {
            ...alert.payload,
            color: 0xffef4444,
            title: '❌  Inactive Job Listing'
          }
        ]
      })
    });
  }
}

async function checkInternshipListings() {
  console.log('Checking for new internships...');
  await updateGitRepos();

  for (const repoUrl of GIT_REPOS) {
    const repoSlug = getRepoSlug(repoUrl);
    const repoPathSlug = repoSlug.replace('/', '-');

    const { openedListings, closedListings } = await getListingUpdates(
      `./cache/listings/${repoPathSlug}.json`,
      `./cache/repos/${repoPathSlug}/.github/scripts/listings.json`
    );

    if (openedListings.length) {
      // biome-ignore format: hard to read
      console.log('Found', openedListings.length, 'opened listings in', repoSlug);

      for (const openedListing of openedListings) {
        await sendListingAlert(repoSlug, openedListing);
      }
    }

    if (closedListings.length) {
      // biome-ignore format: hard to read
      console.log('Found', closedListings.length, 'closed listings in', repoSlug);

      for (const closedListing of closedListings) {
        await sendClosedListingUpdate(repoSlug, closedListing);
      }
    }
  }
}

const job = new Cron(CRON_PATTERN, checkInternshipListings);
console.log('Job started, running on schedule', job.getPattern());
