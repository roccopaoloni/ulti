import { expect, test } from 'vitest';
import { installHelp } from './install.ts';

// Which install help a phone sees: nothing once the app is installed, the browser's Install button
// when it offers one, the Share steps on an iPhone, and a generic hint anywhere else.
test('an installed app shows no install help, whatever else is true', () => {
  expect(installHelp({ standalone: true, ios: false, prompt: false })).toBe('installed');
  expect(installHelp({ standalone: true, ios: true, prompt: true })).toBe('installed');
});

test('a browser that offers its install prompt gets the Install button', () => {
  expect(installHelp({ standalone: false, ios: false, prompt: true })).toBe('prompt');
});

test('an iPhone in a browser tab gets the Share steps, since it has no install prompt', () => {
  expect(installHelp({ standalone: false, ios: true, prompt: false })).toBe('ios');
});

test('any other browser gets the generic hint', () => {
  expect(installHelp({ standalone: false, ios: false, prompt: false })).toBe('other');
});
