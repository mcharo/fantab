import { describe, expect, it } from 'vitest';
import {
  FANTAB_TABS_MIME,
  readTabDragData,
  setTabDragData,
  type DragTabPayload,
} from './dragPayload';

class FakeDataTransfer {
  private store = new Map<string, string>();
  setData(type: string, value: string): void {
    this.store.set(type, value);
  }
  getData(type: string): string {
    return this.store.get(type) ?? '';
  }
}

function makeDt(): DataTransfer {
  return new FakeDataTransfer() as unknown as DataTransfer;
}

describe('drag payload round trip', () => {
  it('carries url + custom title through the fantab type', () => {
    const dt = makeDt();
    const tabs: DragTabPayload[] = [
      { url: 'https://a.example/', title: 'My A' },
      { url: 'https://b.example/path' },
    ];
    setTabDragData(dt, tabs);

    expect(dt.getData('text/uri-list')).toBe(
      'https://a.example/\r\nhttps://b.example/path',
    );
    expect(readTabDragData(dt)).toEqual([
      { url: 'https://a.example/', title: 'My A' },
      { url: 'https://b.example/path', title: undefined },
    ]);
  });

  it('drops non-http urls from the exported payload but keeps the drag valid', () => {
    const dt = makeDt();
    setTabDragData(dt, [{ url: 'chrome://newtab/', title: 'New Tab' }]);

    expect(dt.getData(FANTAB_TABS_MIME)).toBe('');
    expect(dt.getData('text/plain')).toBe('New Tab');
    expect(readTabDragData(dt)).toEqual([]);
  });
});

describe('readTabDragData fallbacks', () => {
  it('parses a text/uri-list, ignoring comments and non-http lines', () => {
    const dt = makeDt();
    dt.setData(
      'text/uri-list',
      '# a comment\r\nhttps://a.example/\r\njavascript:alert(1)\r\nhttps://b.example/',
    );

    expect(readTabDragData(dt)).toEqual([
      { url: 'https://a.example/' },
      { url: 'https://b.example/' },
    ]);
  });

  it('parses a single http url from text/plain', () => {
    const dt = makeDt();
    dt.setData('text/plain', '  https://x.example/  ');
    expect(readTabDragData(dt)).toEqual([{ url: 'https://x.example/' }]);
  });

  it('returns nothing for non-url text', () => {
    const dt = makeDt();
    dt.setData('text/plain', 'just some text');
    expect(readTabDragData(dt)).toEqual([]);
  });
});
