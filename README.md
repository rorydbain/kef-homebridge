# homebridge-kef-lsx

Homebridge plugin to control KEF wireless speakers via HomeKit.

## Supported Speakers

- KEF LSX II
- KEF LS50 Wireless II
- KEF LS60

## Features

- **Source switching** - Switch between WiFi, Bluetooth, HDMI/TV, Optical, USB, and Analog inputs
- **Volume control** - Adjust volume via a brightness slider (HomeKit doesn't have native volume)
- **Power control** - Turn speakers on/off
- **Auto-discovery** - Speakers are found automatically via mDNS

## Installation

```bash
npm install -g homebridge-kef-lsx
```

Or search for "KEF" in the Homebridge UI.

## Configuration

The plugin auto-discovers KEF speakers on your network. No configuration is required.

Optional settings in `config.json`:

```json
{
  "platforms": [
    {
      "platform": "KEFSpeaker",
      "autodiscover": true,
      "pollingInterval": 5000,
      "speakers": [
        {
          "name": "Living Room",
          "ip": "192.168.1.100"
        }
      ]
    }
  ]
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `autodiscover` | `true` | Automatically find speakers via mDNS |
| `pollingInterval` | `5000` | How often to sync state (ms) |
| `speakers` | `[]` | Manual speaker config (optional fallback) |

## HomeKit Devices

Each speaker appears as two accessories:

1. **TV** - Shows power state, tap to select input source
2. **Lightbulb** - Volume control (brightness = volume, on/off = mute)

## NFC Quick Switch (Bonus)

Want to tap your phone to switch to Bluetooth? Create an Apple Shortcut:

1. **Shortcuts app** → New Shortcut → "Get Contents of URL"
2. **URL**: `http://<speaker-ip>/api/setData`
3. **Method**: POST
4. **Headers**: `Content-Type: application/json`
5. **Body**:
```json
{
  "path": "settings:/kef/play/physicalSource",
  "role": "value",
  "value": {
    "type": "kefPhysicalSource",
    "kefPhysicalSource": "bluetooth"
  }
}
```

Then create an NFC automation to run this shortcut when you tap a tag.

## License

MIT
