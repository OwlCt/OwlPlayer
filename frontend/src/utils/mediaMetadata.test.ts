import { describe, expect, it } from 'vitest';
import { getMetadataSourceLabels } from './mediaMetadata';

describe('getMetadataSourceLabels', () => {
  it('groups local metadata sources under tag and deduplicates labels', () => {
    expect(
      getMetadataSourceLabels(
        {
          name: { source: 'tag', confidence: 0.9 },
          albumName: { source: 'remote', confidence: 0.8 },
        },
        {
          name: { source: 'tag', confidence: 0.7 },
          artworkUrl: { source: 'scan', confidence: 0.8 },
        }
      )
    ).toEqual(['标签', '在线增强']);
  });

  it('keeps non-local sources as separate labels', () => {
    expect(
      getMetadataSourceLabels({
        name: { source: 'manual', confidence: 0.9 },
        artworkUrl: { source: 'system', confidence: 0.8 },
      })
    ).toEqual(['手动', '系统']);
  });

  it('ignores missing and unknown sources cleanly', () => {
    expect(
      getMetadataSourceLabels(
        undefined,
        {
          name: { source: '', confidence: 0.8 },
        }
      )
    ).toEqual([]);
  });
});
