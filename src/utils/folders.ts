import type { Folder, Video } from '../types';

export const UNCATEGORIZED_FOLDER_KEY = '__uncategorized__';

export function getFolderDepth(folder: Folder, folders: Folder[]): number {
  let depth = 0;
  let parentId = folder.parentId;
  const seen = new Set<string>([folder.id]);

  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = folders.find(item => item.id === parentId);
    if (!parent) break;
    depth += 1;
    parentId = parent.parentId;
  }

  return depth;
}

export function getFolderPath(folderId: string, folders: Folder[]): string {
  const folder = folders.find(item => item.id === folderId);
  if (!folder) return 'Unknown folder';

  const names = [folder.name];
  let parentId = folder.parentId;
  const seen = new Set<string>([folder.id]);

  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = folders.find(item => item.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }

  return names.join(' / ');
}

export function getFolderOptions(folders: Folder[]): Folder[] {
  const byParent = new Map<string | undefined, Folder[]>();
  folders.forEach(folder => {
    const key = folder.parentId && folders.some(item => item.id === folder.parentId)
      ? folder.parentId
      : undefined;
    byParent.set(key, [...(byParent.get(key) ?? []), folder]);
  });

  byParent.forEach(items => items.sort((a, b) => a.createdAt - b.createdAt));

  const ordered: Folder[] = [];
  const visit = (parentId: string | undefined) => {
    for (const folder of byParent.get(parentId) ?? []) {
      ordered.push(folder);
      visit(folder.id);
    }
  };

  visit(undefined);
  return ordered;
}

export function getDescendantFolderIds(folders: Folder[], folderId: string): string[] {
  const children = folders.filter(folder => folder.parentId === folderId);
  return children.flatMap(child => [child.id, ...getDescendantFolderIds(folders, child.id)]);
}

export function getVideosForFolder(
  videos: Video[],
  folders: Folder[],
  folderId: string,
  includeSubfolders: boolean
): Video[] {
  if (folderId === UNCATEGORIZED_FOLDER_KEY) {
    return videos.filter(video => !video.folderId || !folders.some(folder => folder.id === video.folderId));
  }

  const folderIds = new Set([
    folderId,
    ...(includeSubfolders ? getDescendantFolderIds(folders, folderId) : []),
  ]);

  return videos.filter(video => video.folderId && folderIds.has(video.folderId));
}
