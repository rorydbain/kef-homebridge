export const PLATFORM_NAME = 'KEFSpeaker';
export const PLUGIN_NAME = 'homebridge-kef-lsx';

export const KEF_SOURCES = [
  { id: 'wifi', name: 'WiFi' },
  { id: 'bluetooth', name: 'Bluetooth' },
  { id: 'tv', name: 'HDMI/TV' },
  { id: 'optical', name: 'Optical' },
  { id: 'usb', name: 'USB' },
  { id: 'analog', name: 'Analog' },
] as const;

export type KefSource = (typeof KEF_SOURCES)[number]['id'];

export interface KefSpeakerConfig {
  name?: string;
  ip: string;
}

export interface PluginConfig {
  platform: string;
  autodiscover?: boolean;
  speakers?: KefSpeakerConfig[];
  pollingInterval?: number;
}
