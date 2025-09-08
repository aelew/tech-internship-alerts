import type { AlertData, DiscordIntegration, Listing } from './types';
import { getAlertSlug } from './utils';

async function saveAlert(
  repoSlug: string,
  listing: Listing,
  messageId: string,
  payload: Record<string, any>
) {
  const file = Bun.file('./data/alerts.json');
  const data = (await file.exists()) ? await file.json() : {};

  const alertSlug = getAlertSlug(repoSlug, listing);
  data[alertSlug] = [...(data[alertSlug] || []), { messageId, payload }];

  await Bun.write(file, JSON.stringify(data));
}

export async function publishNewListing(
  integration: DiscordIntegration,
  repoSlug: string,
  listing: Listing
) {
  let season = '--';
  if ('season' in listing) {
    season = listing.season;
  } else if ('terms' in listing) {
    season = listing.terms.join(', ');
  }

  let textContent = `${listing.company_name} • ${listing.title}`;
  if (integration.roleId) {
    textContent = `<@&${integration.roleId}>\n${textContent}`;
  }

  const payload = {
    content: textContent,
    embeds: [
      {
        color: 16755763,
        title: '🔔 New Job Listing',
        fields: [
          {
            name: 'Company',
            value:
              listing.company_url === ''
                ? listing.company_name
                : `[${listing.company_name}](${listing.company_url})`,
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
            value: season,
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

  const response = await fetch(`${integration.webhookUrl}?wait=true`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    method: 'POST'
  });

  if (!response.ok) {
    console.warn(
      'Failed to publish new listing (status:',
      response.status,
      `${response.statusText})`
    );
    console.log('-> Payload:', JSON.stringify(payload));
    console.log('-> Response:', await response.text());
    return;
  }

  const message = await response.json();

  // save alert data so we can edit the message when the listing closes
  await saveAlert(repoSlug, listing, message.id, payload);
}

export async function closePublishedListing(
  integration: DiscordIntegration,
  repoSlug: string,
  listing: Listing
) {
  const file = Bun.file('./data/alerts.json');
  const data = (await file.exists()) ? await file.json() : {};

  const alertSlug = getAlertSlug(repoSlug, listing);
  const prevAlerts: AlertData[] = data[alertSlug];

  if (!prevAlerts) {
    return;
  }

  for (const prevAlert of prevAlerts) {
    const updatedPayload = {
      embeds: [
        {
          ...prevAlert.payload.embeds[0],
          color: 15680580,
          title: '❌  Inactive Job Listing'
        }
      ]
    };

    const response = await fetch(
      `${integration.webhookUrl}/messages/${prevAlert.messageId}`,
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPayload),
        method: 'PATCH'
      }
    );

    if (!response.ok) {
      console.warn(
        'Failed to close published listing (status:',
        response.status,
        `${response.statusText})`
      );
      console.log('-> Payload:', JSON.stringify(updatedPayload));
      console.log('-> Response:', await response.text());
    }

    if (prevAlerts.length > 1) {
      await Bun.sleep(1000);
    }
  }

  // remove listing from alerts, we don't need it anymore
  delete data[alertSlug];
  await Bun.write(file, JSON.stringify(data));
}
