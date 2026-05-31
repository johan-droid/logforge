export enum ProviderType {
  HEROKU = 'heroku',
  RENDER = 'render',
  VERCEL = 'vercel',
  RAILWAY = 'railway',
  CLOUDFLARE = 'cloudflare'
}

export interface LogEvent {
  id?: string;
  timestamp: string;
  serviceId: string;
  provider: ProviderType;
  level?: string;
  message: string;
}

export interface Service {
  id: string;
  credentialId: string;
  providerSvcId: string;
  provider: ProviderType;
  name: string;
  type?: string;
  repoUrl?: string;
  active: boolean;
}

export interface Branch {
  id: string;
  serviceId: string;
  name: string;
  sha?: string;
  status?: string;
  deployUrl?: string;
}
