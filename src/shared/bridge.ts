export interface OpenAtLoginState {
  enabled: boolean;
  available: boolean;
}

export interface LeashBridge {
  platform: string;
  getOpenAtLogin(): Promise<OpenAtLoginState>;
  setOpenAtLogin(enabled: boolean): Promise<OpenAtLoginState>;
}
