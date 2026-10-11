import {
  getAlbumDisplayName,
  getAlbumFolderEntries,
  getAlbumFolderLevel,
  getAlbumFolderPath,
  getAlbumNamePath,
  getAlbumParentUrl,
  parseAlbumFolderPath,
  renameAlbumInFolder,
} from '$lib/utils/album-folders';
import { albumFactory } from '@test-data/factories/album-factory';

const album = (albumName: string) => albumFactory.build({ albumName });

describe('getAlbumNamePath', () => {
  it('splits on slashes and drops empty and blank segments', () => {
    expect(getAlbumNamePath('/Hedy/2022-ski')).toEqual(['Hedy', '2022-ski']);
    expect(getAlbumNamePath('Hedy//  /2022-ski/')).toEqual(['Hedy', '2022-ski']);
    expect(getAlbumNamePath('0806-LakeTahoe')).toEqual(['0806-LakeTahoe']);
    expect(getAlbumNamePath('')).toEqual([]);
  });
});

describe('getAlbumDisplayName', () => {
  it('is the last segment, or the name itself when it has none', () => {
    expect(getAlbumDisplayName('/Hedy/2022-ski')).toBe('2022-ski');
    expect(getAlbumDisplayName('0806-LakeTahoe')).toBe('0806-LakeTahoe');
    expect(getAlbumDisplayName('')).toBe('');
  });
});

describe('getAlbumFolderPath', () => {
  it('is the path without the album itself', () => {
    expect(getAlbumFolderPath('/Hedy/dance/recital')).toEqual(['Hedy', 'dance']);
    expect(getAlbumFolderPath('0806-LakeTahoe')).toEqual([]);
  });
});

describe('getAlbumParentUrl', () => {
  it('is the albums page at the album’s folder', () => {
    expect(getAlbumParentUrl('/Hedy/Art')).toBe('/albums?path=Hedy');
    expect(getAlbumParentUrl('/Hedy/dance/recital')).toBe(`/albums?${new URLSearchParams({ path: 'Hedy/dance' })}`);
    expect(getAlbumParentUrl('wedding')).toBe('/albums');
  });
});

describe('renameAlbumInFolder', () => {
  it('replaces only the album’s own name', () => {
    expect(renameAlbumInFolder('/Hedy/Art', 'Drawings')).toBe('/Hedy/Drawings');
    expect(renameAlbumInFolder('/Art/Art', 'Drawings')).toBe('/Art/Drawings');
    expect(renameAlbumInFolder('wedding', 'Wedding 2019')).toBe('Wedding 2019');
    expect(renameAlbumInFolder('', 'New')).toBe('New');
  });
});

describe('parseAlbumFolderPath', () => {
  it('reads the path search parameter', () => {
    expect(parseAlbumFolderPath(null)).toEqual([]);
    expect(parseAlbumFolderPath('Hedy/2022')).toEqual(['Hedy', '2022']);
  });
});

describe('getAlbumFolderLevel', () => {
  const albums = [
    album('0806-LakeTahoe'),
    album('/Hedy/2022-ski'),
    album('/Hedy/Art'),
    album('/Hedy/dance/自己拍的'),
    album('/Hedy/dance/recital'),
    album('/Hanson/2023'),
    album(''),
  ];

  it('shows top-level folders with their direct child count, and top-level albums', () => {
    const level = getAlbumFolderLevel(albums, []);

    expect(level.folders).toEqual([
      { name: 'Hanson', path: ['Hanson'], itemCount: 1 },
      // 2022-ski, Art and the dance folder
      { name: 'Hedy', path: ['Hedy'], itemCount: 3 },
    ]);
    expect(level.albums.map(({ albumName }) => albumName)).toEqual(['0806-LakeTahoe', '']);
  });

  it('shows a folder’s sub-folders and albums', () => {
    const level = getAlbumFolderLevel(albums, ['Hedy']);

    expect(level.folders).toEqual([{ name: 'dance', path: ['Hedy', 'dance'], itemCount: 2 }]);
    expect(level.albums.map(({ albumName }) => albumName)).toEqual(['/Hedy/2022-ski', '/Hedy/Art']);
  });

  it('shows only albums in a folder without sub-folders', () => {
    const level = getAlbumFolderLevel(albums, ['Hedy', 'dance']);

    expect(level.folders).toEqual([]);
    expect(level.albums.map(({ albumName }) => albumName)).toEqual(['/Hedy/dance/自己拍的', '/Hedy/dance/recital']);
  });

  it('is empty for a folder that does not exist', () => {
    expect(getAlbumFolderLevel(albums, ['Nobody'])).toEqual({ folders: [], albums: [] });
  });

  it('keeps an album and a folder of the same name apart', () => {
    const level = getAlbumFolderLevel([album('Trips'), album('Trips/Paris')], []);

    expect(level.folders).toEqual([{ name: 'Trips', path: ['Trips'], itemCount: 1 }]);
    expect(level.albums.map(({ albumName }) => albumName)).toEqual(['Trips']);
  });
});

describe('getAlbumFolderEntries', () => {
  it('lists a level’s folders and albums together, by name', () => {
    const albums = [album('wedding'), album('/Hedy/piano'), album('/Hedy/outdoor'), album('/351-1/相册'), album('Art')];

    expect(getAlbumFolderEntries(albums, []).map(({ type, name }) => `${type}:${name}`)).toEqual([
      'folder:351-1',
      'album:Art',
      'folder:Hedy',
      'album:wedding',
    ]);
    expect(getAlbumFolderEntries(albums, ['Hedy']).map(({ type, name }) => `${type}:${name}`)).toEqual([
      'album:outdoor',
      'album:piano',
    ]);
  });
});
