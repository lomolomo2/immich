import { Route } from '$lib/route';
import type { AlbumResponseDto } from '@immich/sdk';

// Lomorage nests albums in folders by name, like the Lomorage mobile app: an album named
// "/Hedy/2022-ski" is the album "2022-ski" inside the folder "Hedy". The server only has
// the flat album list, so the folders exist only in the names.

/** The folder path of an album name, ending with the album's own name: "/Hedy/2022-ski" -> ["Hedy", "2022-ski"]. */
export const getAlbumNamePath = (albumName: string): string[] =>
  albumName
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

/** The album's own name, without its folders: "/Hedy/2022-ski" -> "2022-ski". */
export const getAlbumDisplayName = (albumName: string): string => getAlbumNamePath(albumName).at(-1) ?? albumName;

/** Parses the albums page's `path` search parameter ("Hedy/2022") into folder names. */
export const parseAlbumFolderPath = (path: string | null): string[] => (path ? getAlbumNamePath(path) : []);

/** The albums page showing the folder at `path` ([] = the top level). */
export const getAlbumFolderUrl = (path: string[]): string =>
  path.length > 0 ? `${Route.albums()}?${new URLSearchParams({ path: path.join('/') })}` : Route.albums();

export type AlbumFolder = {
  name: string;
  /** Folder names from the top level down to and including this folder. */
  path: string[];
  /** Direct children: sub-folders plus albums. */
  itemCount: number;
};

export type AlbumFolderLevel = {
  folders: AlbumFolder[];
  /** Albums directly in this folder (or at the top level). */
  albums: AlbumResponseDto[];
};

/** The sub-folders and albums directly inside `folderPath` ([] = the top level). */
export const getAlbumFolderLevel = (albums: AlbumResponseDto[], folderPath: string[]): AlbumFolderLevel => {
  const depth = folderPath.length;
  const folderChildren = new Map<string, Set<string>>();
  const levelAlbums: AlbumResponseDto[] = [];

  for (const album of albums) {
    const path = getAlbumNamePath(album.albumName);
    if (path.length === 0) {
      // Unnamed albums live at the top level.
      if (depth === 0) {
        levelAlbums.push(album);
      }
      continue;
    }

    const inFolder = path.length > depth && folderPath.every((segment, index) => path[index] === segment);
    if (!inFolder) {
      continue;
    }

    if (path.length === depth + 1) {
      levelAlbums.push(album);
      continue;
    }

    const folderName = path[depth];
    const child = path.length === depth + 2 ? `album:${album.id}` : `folder:${path[depth + 1]}`;
    let children = folderChildren.get(folderName);
    if (!children) {
      children = new Set();
      folderChildren.set(folderName, children);
    }
    children.add(child);
  }

  const folders = [...folderChildren.entries()]
    .map(([name, children]) => ({ name, path: [...folderPath, name], itemCount: children.size }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { folders, albums: levelAlbums };
};

export type AlbumFolderEntry =
  | { type: 'folder'; name: string; folder: AlbumFolder }
  | { type: 'album'; name: string; album: AlbumResponseDto };

/** The sub-folders and albums directly inside `folderPath`, in one list sorted by name. */
export const getAlbumFolderEntries = (albums: AlbumResponseDto[], folderPath: string[]): AlbumFolderEntry[] => {
  const level = getAlbumFolderLevel(albums, folderPath);
  return [
    ...level.folders.map((folder) => ({ type: 'folder' as const, name: folder.name, folder })),
    ...level.albums.map((album) => ({ type: 'album' as const, name: getAlbumDisplayName(album.albumName), album })),
  ].sort((a, b) => a.name.localeCompare(b.name));
};
