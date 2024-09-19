export type Listing = {
  id: string;
  source: string;
  company_name: string;
  company_url: string;
  title: string;
  locations: string[];
  sponsorship: string;
  active: boolean;
  url: string;
  is_visible: boolean;
  date_posted: number;
  date_updated: number;
} & ({ season: string } | { terms: string[] });
