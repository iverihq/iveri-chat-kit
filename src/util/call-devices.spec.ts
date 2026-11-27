import { describe, expect, it } from 'vitest';

import { callDeviceChoice } from './call-devices.js';

const device = (deviceId: string, label = ''): { deviceId: string; label: string } => ({ deviceId, label });

describe('callDeviceChoice', () => {
    it('keeps what the browser named, numbers what it did not, and leaves out what cannot be chosen', () => {
        const choice = callDeviceChoice([device(''), device('mic-a', 'Desk microphone'), device('mic-b', '  ')], null);

        expect(choice.options).toEqual([
            { id: 'mic-a', label: 'Desk microphone', number: 1 },
            { id: 'mic-b', label: null, number: 2 },
        ]);
    });

    it('selects the device LiveKit switched to', () => {
        const choice = callDeviceChoice([device('default', 'Default'), device('mic-b', 'Headset')], 'mic-b');

        expect(choice.selected).toBe('mic-b');
    });

    it("stands the browser's default in for nothing switched yet, or a device that has gone", () => {
        expect(callDeviceChoice([device('mic-a', 'A'), device('default', 'Default')], null).selected).toBe('default');
        expect(callDeviceChoice([device('mic-a', 'A'), device('mic-b', 'B')], 'unplugged').selected).toBe('mic-a');
    });

    it('selects nothing where there is nothing', () => {
        expect(callDeviceChoice([device('')], 'mic-a')).toEqual({ options: [], selected: null });
    });
});
