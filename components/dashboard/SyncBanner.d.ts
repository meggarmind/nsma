export interface SyncBannerProps {
  syncing: boolean;
  lastSync: string | null;
  onSync: () => void;
}

declare const SyncBanner: React.FC<SyncBannerProps>;
export default SyncBanner;
