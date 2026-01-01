import type {
  API,
  CharacteristicValue,
  Logger,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { KefApi } from './kefApi.js';
import { KEF_SOURCES, type KefSource, PLATFORM_NAME } from './settings.js';

export class KefAccessory {
  private readonly tvService: Service;
  private readonly inputServices: Service[] = [];
  private readonly volumeService: Service;
  private readonly api: KefApi;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  // Cached state
  private currentPower = false;
  private currentSource: KefSource = 'wifi';
  private currentVolume = 50;
  private currentMute = false;

  constructor(
    private readonly platform: { readonly log: Logger; readonly api: API },
    private readonly accessory: PlatformAccessory,
    speakerIp: string,
    private readonly pollingMs: number = 5000,
  ) {
    this.api = new KefApi({ ip: speakerIp });

    const Characteristic = this.platform.api.hap.Characteristic;
    const Service = this.platform.api.hap.Service;

    // Set accessory info
    const infoService = this.accessory.getService(Service.AccessoryInformation);
    if (infoService) {
      infoService
        .setCharacteristic(Characteristic.Manufacturer, 'KEF')
        .setCharacteristic(Characteristic.Model, 'LSX II')
        .setCharacteristic(Characteristic.SerialNumber, speakerIp);
    }

    // Create or get TV service
    this.tvService =
      this.accessory.getService(Service.Television) ||
      this.accessory.addService(Service.Television);

    this.tvService
      .setCharacteristic(
        Characteristic.ConfiguredName,
        accessory.context.displayName || 'KEF Speaker',
      )
      .setCharacteristic(
        Characteristic.SleepDiscoveryMode,
        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
      );

    // Handle power state
    this.tvService
      .getCharacteristic(Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    // Handle input source changes
    this.tvService
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .onGet(this.getActiveIdentifier.bind(this))
      .onSet(this.setActiveIdentifier.bind(this));

    // Set up input sources
    this.setupInputSources();

    // Create volume control as a Lightbulb
    this.volumeService =
      this.accessory.getService(Service.Lightbulb) ||
      this.accessory.addService(
        Service.Lightbulb,
        `${accessory.context.displayName || 'KEF'} Volume`,
        'volume',
      );

    this.volumeService
      .getCharacteristic(Characteristic.On)
      .onGet(this.getVolumeOn.bind(this))
      .onSet(this.setVolumeOn.bind(this));

    this.volumeService
      .getCharacteristic(Characteristic.Brightness)
      .onGet(this.getVolume.bind(this))
      .onSet(this.setVolume.bind(this));

    // Start polling for state changes
    this.startPolling();
  }

  private setupInputSources(): void {
    const Characteristic = this.platform.api.hap.Characteristic;
    const Service = this.platform.api.hap.Service;

    // Remove any existing input sources
    this.accessory.services
      .filter((s) => s.UUID === Service.InputSource.UUID)
      .forEach((s) => this.accessory.removeService(s));

    KEF_SOURCES.forEach((source, index) => {
      const inputService = this.accessory.addService(
        Service.InputSource,
        source.name,
        source.id,
      );

      inputService
        .setCharacteristic(Characteristic.Identifier, index)
        .setCharacteristic(Characteristic.ConfiguredName, source.name)
        .setCharacteristic(
          Characteristic.IsConfigured,
          Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
          Characteristic.InputSourceType,
          Characteristic.InputSourceType.OTHER,
        )
        .setCharacteristic(
          Characteristic.CurrentVisibilityState,
          Characteristic.CurrentVisibilityState.SHOWN,
        );

      this.tvService.addLinkedService(inputService);
      this.inputServices.push(inputService);
    });
  }

  private async getActive(): Promise<CharacteristicValue> {
    try {
      this.currentPower = await this.api.getPowerStatus();
    } catch (error) {
      this.platform.log.debug('Failed to get power status:', error);
    }
    return this.currentPower
      ? this.platform.api.hap.Characteristic.Active.ACTIVE
      : this.platform.api.hap.Characteristic.Active.INACTIVE;
  }

  private async setActive(value: CharacteristicValue): Promise<void> {
    const isOn = value === this.platform.api.hap.Characteristic.Active.ACTIVE;
    this.platform.log.info(`Setting power to ${isOn ? 'ON' : 'OFF'}`);
    try {
      await this.api.setPower(isOn);
      this.currentPower = isOn;
    } catch (error) {
      this.platform.log.error('Failed to set power:', error);
      throw error;
    }
  }

  private async getActiveIdentifier(): Promise<CharacteristicValue> {
    try {
      this.currentSource = await this.api.getSource();
    } catch (error) {
      this.platform.log.debug('Failed to get source:', error);
    }
    const index = KEF_SOURCES.findIndex((s) => s.id === this.currentSource);
    return index >= 0 ? index : 0;
  }

  private async setActiveIdentifier(value: CharacteristicValue): Promise<void> {
    const index = value as number;
    const source = KEF_SOURCES[index];
    if (!source) {
      this.platform.log.warn(`Invalid source index: ${index}`);
      return;
    }

    this.platform.log.info(`Switching to ${source.name}`);
    try {
      await this.api.setSource(source.id);
      this.currentSource = source.id;
    } catch (error) {
      this.platform.log.error('Failed to set source:', error);
      throw error;
    }
  }

  private async getVolumeOn(): Promise<CharacteristicValue> {
    try {
      this.currentMute = await this.api.getMute();
    } catch (error) {
      this.platform.log.debug('Failed to get mute status:', error);
    }
    return !this.currentMute;
  }

  private async setVolumeOn(value: CharacteristicValue): Promise<void> {
    const muted = !value;
    this.platform.log.info(`Setting mute to ${muted ? 'ON' : 'OFF'}`);
    try {
      await this.api.setMute(muted);
      this.currentMute = muted;
    } catch (error) {
      this.platform.log.error('Failed to set mute:', error);
      throw error;
    }
  }

  private async getVolume(): Promise<CharacteristicValue> {
    try {
      this.currentVolume = await this.api.getVolume();
    } catch (error) {
      this.platform.log.debug('Failed to get volume:', error);
    }
    return this.currentVolume;
  }

  private async setVolume(value: CharacteristicValue): Promise<void> {
    const volume = value as number;
    this.platform.log.info(`Setting volume to ${volume}`);
    try {
      await this.api.setVolume(volume);
      this.currentVolume = volume;
    } catch (error) {
      this.platform.log.error('Failed to set volume:', error);
      throw error;
    }
  }

  private startPolling(): void {
    this.pollingInterval = setInterval(async () => {
      try {
        const [power, source, volume, mute] = await Promise.all([
          this.api.getPowerStatus(),
          this.api.getSource(),
          this.api.getVolume(),
          this.api.getMute(),
        ]);

        const Characteristic = this.platform.api.hap.Characteristic;

        // Update power if changed
        if (power !== this.currentPower) {
          this.currentPower = power;
          this.tvService.updateCharacteristic(
            Characteristic.Active,
            power
              ? Characteristic.Active.ACTIVE
              : Characteristic.Active.INACTIVE,
          );
        }

        // Update source if changed
        if (source !== this.currentSource) {
          this.currentSource = source;
          const index = KEF_SOURCES.findIndex((s) => s.id === source);
          if (index >= 0) {
            this.tvService.updateCharacteristic(
              Characteristic.ActiveIdentifier,
              index,
            );
          }
        }

        // Update volume if changed
        if (volume !== this.currentVolume) {
          this.currentVolume = volume;
          this.volumeService.updateCharacteristic(
            Characteristic.Brightness,
            volume,
          );
        }

        // Update mute if changed
        if (mute !== this.currentMute) {
          this.currentMute = mute;
          this.volumeService.updateCharacteristic(Characteristic.On, !mute);
        }
      } catch (error) {
        this.platform.log.debug('Polling failed:', error);
      }
    }, this.pollingMs);
  }

  destroy(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
