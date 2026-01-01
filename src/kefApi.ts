import type { KefSource } from './settings.js';

export interface KefApiOptions {
  ip: string;
  timeout?: number;
}

export class KefApi {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(options: KefApiOptions) {
    this.baseUrl = `http://${options.ip}`;
    this.timeout = options.timeout ?? 5000;
  }

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async post<T>(path: string, body: object): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const text = await response.text();
      // KEF sometimes returns just "true" for success
      if (text === 'true') {
        return true as T;
      }
      return JSON.parse(text);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getVolume(): Promise<number> {
    const data = await this.get<Array<{ type: string; i32_: number }>>(
      '/api/getData?path=player:volume&roles=value',
    );
    return data[0]?.i32_ ?? 0;
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    await this.post('/api/setData', {
      path: 'player:volume',
      role: 'value',
      value: { type: 'i32_', i32_: clamped },
    });
  }

  async getSource(): Promise<KefSource> {
    const data = await this.get<
      Array<{ type: string; kefPhysicalSource: KefSource }>
    >('/api/getData?path=settings:/kef/play/physicalSource&roles=value');
    return data[0]?.kefPhysicalSource ?? 'wifi';
  }

  async setSource(source: KefSource): Promise<void> {
    await this.post('/api/setData', {
      path: 'settings:/kef/play/physicalSource',
      role: 'value',
      value: { type: 'kefPhysicalSource', kefPhysicalSource: source },
    });
  }

  async getPowerStatus(): Promise<boolean> {
    const data = await this.get<
      Array<{ type: string; kefSpeakerStatus: string }>
    >('/api/getData?path=settings:/kef/host/speakerStatus&roles=value');
    return data[0]?.kefSpeakerStatus === 'powerOn';
  }

  async setPower(on: boolean): Promise<void> {
    if (on) {
      // Turning on: set to wifi source (or restore previous source)
      await this.setSource('wifi');
    } else {
      // Turning off: set to standby
      await this.post('/api/setData', {
        path: 'settings:/kef/play/physicalSource',
        role: 'value',
        value: { type: 'kefPhysicalSource', kefPhysicalSource: 'standby' },
      });
    }
  }

  async getMute(): Promise<boolean> {
    const data = await this.get<Array<{ type: string; bool_: boolean }>>(
      '/api/getData?path=settings:/mediaPlayer/mute&roles=value',
    );
    return data[0]?.bool_ ?? false;
  }

  async setMute(muted: boolean): Promise<void> {
    await this.post('/api/setData', {
      path: 'settings:/mediaPlayer/mute',
      role: 'value',
      value: { type: 'bool_', bool_: muted },
    });
  }

  async getDeviceName(): Promise<string> {
    const data = await this.get<Array<{ type: string; string_: string }>>(
      '/api/getData?path=settings:/deviceName&roles=value',
    );
    return data[0]?.string_ ?? 'KEF Speaker';
  }

  async isReachable(): Promise<boolean> {
    try {
      await this.getPowerStatus();
      return true;
    } catch {
      return false;
    }
  }
}
