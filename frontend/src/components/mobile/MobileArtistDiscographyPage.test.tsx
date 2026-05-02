import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MobileArtistDiscographyPage from './MobileArtistDiscographyPage';
import { usePlayerStore } from '../../store/playerStore';

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: vi.fn(),
}));

vi.mock('../CachedImage', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('./MobileHeader', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('./MobileAlbumMenu', () => ({
  default: () => null,
}));

vi.mock('../../hooks/useNavigationHistory', () => ({
  useGoBack: () => vi.fn(),
}));

describe('MobileArtistDiscographyPage', () => {
  beforeAll(() => {
    class MockIntersectionObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePlayerStore).mockReturnValue({
      queueSource: { type: null, id: null },
      isPlaying: false,
    } as never);
  });

  it('filters discography by album, ep, and single chips', () => {
    render(
      <MemoryRouter>
        <MobileArtistDiscographyPage
          artistId="artist-1"
          artistName="测试艺人"
          discography={{
            albums: [
              {
                id: 'album-1',
                name: '标准专辑',
                artistName: '测试艺人',
                artworkUrl: 'https://example.com/album.jpg',
                releaseDate: '2024-01-01',
                trackCount: 10,
              },
            ],
            singlesAndEPs: [
              {
                id: 'ep-1',
                name: '城市漫游',
                artistName: '测试艺人',
                artworkUrl: 'https://example.com/ep.jpg',
                releaseDate: '2024-02-01',
                trackCount: 5,
                releaseType: 'ep',
                isSingle: true,
              },
              {
                id: 'single-1',
                name: '夜行 - Single',
                artistName: '测试艺人',
                artworkUrl: 'https://example.com/single.jpg',
                releaseDate: '2024-03-01',
                trackCount: 1,
                releaseType: 'single',
                isSingle: true,
              },
            ],
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('标准专辑')).toBeInTheDocument();
    expect(screen.queryByText('城市漫游')).not.toBeInTheDocument();
    expect(screen.queryByText('夜行 - Single')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /EP/ }));
    expect(screen.getByText('城市漫游')).toBeInTheDocument();
    expect(screen.queryByText('标准专辑')).not.toBeInTheDocument();
    expect(screen.queryByText('夜行 - Single')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /单曲/ }));
    expect(screen.getByText('夜行 - Single')).toBeInTheDocument();
    expect(screen.queryByText('标准专辑')).not.toBeInTheDocument();
    expect(screen.queryByText('城市漫游')).not.toBeInTheDocument();
  });
});
