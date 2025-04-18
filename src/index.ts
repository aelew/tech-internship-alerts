import { Cron } from 'croner';
import { simpleGit as git } from 'simple-git';
import { GIT_REPOS } from './data';
import { directoryExists, getAlertSlug, getRepoSlug } from './utils';
import { rimraf } from 'rimraf';
import type { Listing } from './types';

import stamp from 'console-stamp';

stamp(console);

const { CRON_PATTERN, DISCORD_WEBHOOK_URL } = process.env;
if (!(CRON_PATTERN && DISCORD_WEBHOOK_URL)) {
  throw new Error('One or more environment variables are missing.');
}

async function updateGitRepos() {
  for (const repoUrl of GIT_REPOS) {
    const repoSlug = getRepoSlug(repoUrl);
    const localPath = `./data/repos/${repoSlug.replace('/', '-')}`;

    async function cloneRepo() {
      console.log(`Cloning ${repoSlug} -> ${localPath}...`);

      await git().clone(repoUrl, localPath, [
        '--sparse',
        '--depth=1',
        '--filter=blob:none'
      ]);

      await git()
        .cwd(localPath)
        .raw('sparse-checkout', 'set', '.github/scripts');

      console.log(`Cloned ${repoSlug} -> ${localPath}...`);
    }

    if (await directoryExists(localPath)) {
      const repoListingsPathFile = Bun.file(
        `${localPath}/.github/scripts/listings.json`
      );
      if (!(await repoListingsPathFile.exists())) {
        console.log(`Recloning ${repoSlug} (incomplete repo)`);
        await rimraf(localPath);
        await cloneRepo();
      }

      try {
        const { summary } = await git().cwd(localPath).pull();

        if (summary.changes || summary.insertions || summary.deletions) {
          console.log(
            'Pulled',
            repoSlug,
            `(${summary.changes} changes, ${summary.insertions} insertions, ${summary.deletions} deletions)`
          );
        }
      } catch (err) {
        console.error(err);
        console.error(`Recloning ${repoSlug} (pull failed)`);
        await rimraf(localPath);
        await cloneRepo();
      }
    } else {
      await cloneRepo();
    }
  }
}

async function getListingUpdates(
  oldListingsPath: string,
  repoListingsPath: string
) {
  const oldListingsFile = Bun.file(oldListingsPath);
  const repoListingsFile = Bun.file(repoListingsPath);
  if (!(await repoListingsFile.exists())) {
    return { openedListings: [], closedListings: [] };
  }

  const repoListingsData: Listing[] = await repoListingsFile.json();
  const closedListings: Listing[] = [];
  let openedListings: Listing[] = [];

  if (await oldListingsFile.exists()) {
    const oldListingData: Listing[] = await oldListingsFile.json();

    openedListings = repoListingsData.filter((newListing) => {
      const oldListing = oldListingData.find(
        (ol) =>
          ol.id === newListing.id && ol.company_name === newListing.company_name
      );
      if (!oldListing) {
        return newListing.active && newListing.is_visible;
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
  await Bun.write(oldListingsPath, JSON.stringify(repoListingsData));

  return { openedListings, closedListings };
}

async function sendListingAlert(repoSlug: string, listing: Listing) {
  const payload = {
    content: process.env.DISCORD_MENTION_ROLE_ID
      ? `<@&${process.env.DISCORD_MENTION_ROLE_ID}>`
      : '',
    embeds: [
      {
        color: 16755763,
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
            value:
              'terms' in listing ? listing.terms.join(', ') : listing.season,
            inline: true
          },
          {
            name: 'Source',
            value: repoSlug.split('/')[0],
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
            value:
              listing.source === 'Simplify'
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
      `${response.statusText})`
    );
    console.log('-> Payload:', JSON.stringify(payload));
    console.log('-> Response:', await response.text());
    return;
  }

  const message = await response.json();

  // Saves the alert message ID so we can edit the message when the listing closes
  const alertsFile = Bun.file('./data/alerts.json');
  const alertData = (await alertsFile.exists()) ? await alertsFile.json() : {};
  const alertSlug = getAlertSlug(repoSlug, listing);

  alertData[alertSlug] = [
    ...(alertData[alertSlug] || []),
    { messageId: message.id, payload }
  ];

  Bun.write(alertsFile, JSON.stringify(alertData));
}

async function sendClosedListingUpdate(repoSlug: string, listing: Listing) {
  const alertsFile = Bun.file('./data/alerts.json');
  const alertData = (await alertsFile.exists()) ? await alertsFile.json() : {};
  const alertSlug = getAlertSlug(repoSlug, listing);

  const alerts = alertData[alertSlug];
  if (!alerts) {
    return;
  }

  for (const alert of alerts) {
    const payload = {
      embeds: [
        {
          ...alert.payload.embeds[0],
          color: 15680580,
          title: '❌  Inactive Job Listing'
        }
      ]
    };

    const response = await fetch(
      `${DISCORD_WEBHOOK_URL}/messages/${alert.messageId}`,
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        method: 'PATCH'
      }
    );
    if (!response.ok) {
      console.warn(
        'Failed to send closed listing update (Status:',
        response.status,
        `${response.statusText})`
      );
      console.log('-> Payload:', JSON.stringify(payload));
      console.log('-> Response:', await response.text());
    }

    if (alerts.length > 1) {
      await Bun.sleep(1000);
    }
  }
}

async function checkInternshipListings() {
  await updateGitRepos();

  for (const repoUrl of GIT_REPOS) {
    const repoSlug = getRepoSlug(repoUrl);
    const repoPathSlug = repoSlug.replace('/', '-');

    const { openedListings, closedListings } = await getListingUpdates(
      `./data/listings/${repoPathSlug}.json`,
      `./data/repos/${repoPathSlug}/.github/scripts/listings.json`
    );

    if (openedListings.length) {
      console.log(
        `Found ${openedListings.length} opened listings in ${repoSlug}`
      );

      for (const openedListing of openedListings) {
        await sendListingAlert(repoSlug, openedListing);
        await Bun.sleep(1000);
      }
    }

    if (closedListings.length) {
      console.log(
        `Found ${closedListings.length} closed listings in ${repoSlug}`
      );

      for (const closedListing of closedListings) {
        await sendClosedListingUpdate(repoSlug, closedListing);
        await Bun.sleep(1000);
      }
    }
  }
}

const job = new Cron(CRON_PATTERN, checkInternshipListings);
console.log('Job started, running on schedule', job.getPattern());

job.trigger();
