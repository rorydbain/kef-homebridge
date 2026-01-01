import type { Logger } from 'homebridge';

export interface DiscoveredSpeaker {
  name: string;
  ip: string;
  port: number;
}

export interface DiscoveryCallbacks {
  onSpeakerFound: (speaker: DiscoveredSpeaker) => void;
  onSpeakerLost?: (speaker: DiscoveredSpeaker) => void;
}

const KEF_NAME_PATTERNS = [/^LSX/i, /^LS50/i, /^LS60/i, /^KEF/i];

function isKefSpeaker(name: string): boolean {
  return KEF_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

export class SpeakerDiscovery {
  private bonjour: any = null;
  private browser: any = null;
  private discoveredSpeakers = new Map<string, DiscoveredSpeaker>();

  constructor(private readonly log: Logger) {}

  async start(callbacks: DiscoveryCallbacks): Promise<void> {
    this.log.info('Starting mDNS discovery for KEF speakers...');

    try {
      // Dynamic import to handle CommonJS/ESM compatibility
      const bonjourModule = await import('bonjour-service');
      const Bonjour = bonjourModule.Bonjour;

      this.bonjour = new Bonjour();
      this.browser = this.bonjour.find({ type: 'http' }, (service: any) => {
        this.handleService(service, callbacks);
      });
    } catch (error) {
      this.log.error('Failed to start mDNS discovery:', error);
    }
  }

  private handleService(service: any, callbacks: DiscoveryCallbacks): void {
    const name = service.name;

    if (!isKefSpeaker(name)) {
      return;
    }

    // Get the first IPv4 address
    const ip = service.addresses?.find(
      (addr: string) => addr.includes('.') && !addr.startsWith('169.254'),
    );

    if (!ip) {
      this.log.debug(`Found KEF speaker "${name}" but no valid IP address`);
      return;
    }

    const speaker: DiscoveredSpeaker = {
      name,
      ip,
      port: service.port || 80,
    };

    const key = `${ip}:${speaker.port}`;
    if (!this.discoveredSpeakers.has(key)) {
      this.discoveredSpeakers.set(key, speaker);
      this.log.info(`Discovered KEF speaker: ${name} at ${ip}`);
      callbacks.onSpeakerFound(speaker);
    }
  }

  stop(): void {
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
    if (this.bonjour) {
      this.bonjour.destroy();
      this.bonjour = null;
    }
    this.log.info('Stopped mDNS discovery');
  }

  getDiscoveredSpeakers(): DiscoveredSpeaker[] {
    return Array.from(this.discoveredSpeakers.values());
  }
}
