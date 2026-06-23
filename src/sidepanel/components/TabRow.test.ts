import { describe, expect, it } from 'vitest';
import source from './TabRow.svelte?raw';

describe('TabRow layout', () => {
  it('places the audio indicator immediately after the tab title', () => {
    const titleIndex = source.indexOf('<div class="title-line">');
    const audioIndex = source.indexOf('class="audio-btn"');
    const toolsIndex = source.indexOf('<div class="tools">');

    expect(titleIndex).toBeGreaterThan(-1);
    expect(audioIndex).toBeGreaterThan(-1);
    expect(toolsIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeLessThan(audioIndex);
    expect(audioIndex).toBeLessThan(toolsIndex);
  });
});
