export interface AppUpdateInfo {
  readonly version: string;
  readonly notes?: string;
}

export interface AppUpdateProgress {
  readonly downloadedBytes: number;
  readonly totalBytes?: number;
  readonly phase: "downloading" | "installing";
}

export interface AppUpdateService {
  check(): Promise<AppUpdateInfo | null>;
  dismiss(): Promise<void>;
  install(onProgress: (progress: AppUpdateProgress) => void): Promise<void>;
}
