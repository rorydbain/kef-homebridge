import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';
import {
  SpeakerDiscovery,
  type DiscoveredSpeaker,
} from './discovery.js';
import { KefAccessory } from './kefAccessory.js';
import { KefApi } from './kefApi.js';
import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  type PluginConfig,
} from './settings.js';

export class KefSpeakerPlatform implements DynamicPlatformPlugin {
  public readonly accessories: PlatformAccessory[] = [];
  private readonly kefAccessories = new Map<string, KefAccessory>();
  private discovery: SpeakerDiscovery | null = null;
  private readonly config: PluginConfig;

  constructor(
    public readonly log: Logger,
    platformConfig: PlatformConfig,
    public readonly api: API,
  ) {
    this.config = platformConfig as PluginConfig;

    this.log.info('KEF Speaker Platform initializing...');

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });

    this.api.on('shutdown', () => {
      this.shutdown();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info(
      `Loading accessory from cache: ${accessory.displayName}`,
    );
    this.accessories.push(accessory);
  }

  private async discoverDevices(): Promise<void> {
    const autodiscover = this.config.autodiscover !== false;
    const pollingInterval = this.config.pollingInterval ?? 5000;

    // Handle manual speaker configurations
    if (this.config.speakers?.length) {
      for (const speaker of this.config.speakers) {
        await this.addSpeaker({
          name: speaker.name || 'KEF Speaker',
          ip: speaker.ip,
          port: 80,
        }, pollingInterval);
      }
    }

    // Start autodiscovery if enabled
    if (autodiscover) {
      this.discovery = new SpeakerDiscovery(this.log);
      this.discovery.start({
        onSpeakerFound: async (speaker) => {
          await this.addSpeaker(speaker, pollingInterval);
        },
      });
    }
  }

  private async addSpeaker(
    speaker: DiscoveredSpeaker,
    pollingInterval: number,
  ): Promise<void> {
    const uuid = this.api.hap.uuid.generate(speaker.ip);

    // Check if we already have this accessory
    if (this.kefAccessories.has(uuid)) {
      this.log.debug(`Speaker at ${speaker.ip} already registered`);
      return;
    }

    // Try to get the actual device name from the speaker
    let displayName = speaker.name;
    try {
      const api = new KefApi({ ip: speaker.ip });
      displayName = await api.getDeviceName();
    } catch {
      this.log.debug(`Could not get device name for ${speaker.ip}`);
    }

    // Check for existing accessory
    const existingAccessory = this.accessories.find(
      (acc) => acc.UUID === uuid,
    );

    if (existingAccessory) {
      this.log.info(`Restoring existing accessory: ${displayName}`);
      existingAccessory.context.speakerIp = speaker.ip;
      existingAccessory.context.displayName = displayName;

      const kefAccessory = new KefAccessory(
        this,
        existingAccessory,
        speaker.ip,
        pollingInterval,
      );
      this.kefAccessories.set(uuid, kefAccessory);

      this.api.updatePlatformAccessories([existingAccessory]);
    } else {
      this.log.info(`Adding new accessory: ${displayName}`);
      const accessory = new this.api.platformAccessory(displayName, uuid);
      accessory.context.speakerIp = speaker.ip;
      accessory.context.displayName = displayName;

      // Important: Set the category to TV for proper HomeKit behavior
      accessory.category = this.api.hap.Categories.TELEVISION;

      const kefAccessory = new KefAccessory(
        this,
        accessory,
        speaker.ip,
        pollingInterval,
      );
      this.kefAccessories.set(uuid, kefAccessory);

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);
      this.accessories.push(accessory);
    }
  }

  private shutdown(): void {
    this.log.info('Shutting down KEF Speaker Platform...');

    if (this.discovery) {
      this.discovery.stop();
    }

    for (const kefAccessory of this.kefAccessories.values()) {
      kefAccessory.destroy();
    }
  }
}
