export interface AddressRecord {
  block: string;
  road: string;
  postal_code: string;
  full: string;
}

export interface AccountRecord {
  label: string;
  name: string;
  age: number;
  birthday: string;
  address: string;
  postal_code: string;
  email: string;
  cloudmail_account_id: number | string;
  all_receive: number;
  latest_email_id: number;
  verification_code: string;
  verification_time: string;
  created_at: string;
  updated_at: string;
}

export interface StatusSummary {
  config_exists: boolean;
  history_count: number;
  address_count: number;
  used_address_count: number;
  last_account: string;
}

export interface CloudMailWebsiteConfig {
  addEmail?: number;
  minEmailPrefix?: number;
}

export interface CloudMailAccount {
  accountId: number | string;
  email: string;
  allReceive?: number;
}

export interface CloudMailEmail {
  emailId: number;
  subject?: string;
  text?: string;
  content?: string;
  createTime?: string;
}

export interface OneMapResult {
  BLK_NO?: string;
  ROAD_NAME?: string;
  POSTAL?: string;
  ADDRESS?: string;
  BUILDING?: string;
  SEARCHVAL?: string;
}

export interface OneMapSearchResponse {
  found?: number;
  totalNumPages?: number;
  results?: OneMapResult[];
}

export interface OAuthStatus {
  status?: string;
  state?: string;
  active?: boolean;
  success?: boolean;
  authenticated?: boolean;
  is_authenticated?: boolean;
  email?: string;
  account_email?: string;
  user_email?: string;
  error?: string;
  user?: { email?: string };
}

export interface AuthFile {
  type?: string;
  provider?: string;
  name?: string;
  filename?: string;
  email?: string;
  account_type?: string;
  account?: string;
  user?: { email?: string };
}

export type Notify = (message: string, isError?: boolean) => void;
