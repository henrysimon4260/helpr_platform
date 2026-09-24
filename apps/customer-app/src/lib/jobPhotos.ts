export const JOB_PHOTOS_BUCKET = 'job-photos';

export const JOB_PHOTO_UPLOAD_FAILURE_MESSAGE =
  "We couldn't upload your photos, so this request was not saved. Please try again.";

export class JobPhotoUploadError extends Error {
  constructor(message = JOB_PHOTO_UPLOAD_FAILURE_MESSAGE) {
    super(message);
    this.name = 'JobPhotoUploadError';
  }
}

export type JobPhotoAsset = {
  uri: string;
  name?: string | null;
  type?: string | null;
  contentType?: string | null;
};

export type StorageUploadOptions = {
  contentType: string;
  upsert: boolean;
};

export type StorageUploader = {
  upload: (
    bucket: string,
    path: string,
    body: Uint8Array,
    options: StorageUploadOptions,
  ) => Promise<{ error: { message?: string } | null }>;
  getPublicUrl: (bucket: string, path: string) => string;
};

export type PhotoBytesReader = (uri: string) => Promise<Uint8Array>;

type JobPhotoClient = {
  storage: {
    from: (bucket: string) => any;
  };
  from: (table: string) => any;
};

export function isRemotePhotoUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

export function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function sanitizePhotoFileName(name: string, index: number): string {
  const base = name.split(/[/\\]/).pop()?.split('?')[0] ?? '';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 80);
  if (!cleaned) {
    return `photo-${index + 1}.jpg`;
  }
  return cleaned;
}

export function buildJobPhotoObjectPath(
  ownerId: string,
  serviceId: string,
  fileName: string,
  index: number,
  uniqueId: string,
): string {
  const owner = sanitizePathSegment(ownerId);
  const service = sanitizePathSegment(serviceId);
  if (!owner || !service) {
    throw new JobPhotoUploadError();
  }
  const unique = sanitizePathSegment(uniqueId) || `photo-${index}`;
  const file = sanitizePhotoFileName(fileName, index);
  return `${owner}/${service}/${unique}-${file}`;
}

export function contentTypeForAsset(asset: JobPhotoAsset): string {
  if (asset.contentType && asset.contentType.trim()) {
    return asset.contentType.trim();
  }
  const name = asset.name ?? asset.uri;
  const extension = name.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  if (extension === 'mp4') return 'video/mp4';
  if (extension === 'mov') return 'video/quicktime';
  if (asset.type === 'video') return 'video/mp4';
  return 'image/jpeg';
}

export function parsePhotoUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && isRemotePhotoUri(item));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    try {
      return parsePhotoUrls(JSON.parse(trimmed));
    } catch {
      return isRemotePhotoUri(trimmed) ? [trimmed] : [];
    }
  }
  return [];
}

export function mergePhotoUrls(existing: unknown, uploaded: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const url of [...parsePhotoUrls(existing), ...uploaded]) {
    if (!isRemotePhotoUri(url) || seen.has(url)) {
      continue;
    }
    seen.add(url);
    merged.push(url);
  }
  return merged;
}

export function createSupabaseJobPhotoUploader(client: JobPhotoClient): StorageUploader {
  return {
    async upload(bucket, path, body, options) {
      const { error } = await client.storage.from(bucket).upload(path, body, {
        cacheControl: '3600',
        upsert: options.upsert,
        contentType: options.contentType,
      });
      return { error: error ? { message: error.message ?? 'Photo upload failed.' } : null };
    },
    getPublicUrl(bucket, path) {
      const { data } = client.storage.from(bucket).getPublicUrl(path);
      return data?.publicUrl ?? '';
    },
  };
}

export async function readPhotoBytes(uri: string): Promise<Uint8Array> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new JobPhotoUploadError();
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new JobPhotoUploadError();
  }
  return bytes;
}

async function loadExistingPhotoUrls(client: JobPhotoClient, serviceId: string): Promise<unknown> {
  const { data, error } = await client.from('service').select('photo_urls').eq('service_id', serviceId).maybeSingle();
  if (error) {
    console.error('Failed to read existing job photos:', error.message);
    throw new JobPhotoUploadError();
  }
  return data?.photo_urls;
}

export async function resolveJobPhotoUrls(input: {
  client: JobPhotoClient;
  userId: string | null | undefined;
  serviceId: string;
  assets: JobPhotoAsset[];
  isEditing: boolean;
  readBytes?: PhotoBytesReader;
  createUniqueId?: (index: number) => string;
}): Promise<string[] | undefined> {
  const assets = input.assets.filter(asset => typeof asset.uri === 'string' && asset.uri.length > 0);
  const localAssets = assets.filter(asset => !isRemotePhotoUri(asset.uri));
  if (localAssets.length === 0) {
    return undefined;
  }
  if (!input.userId) {
    throw new JobPhotoUploadError();
  }

  const existing = input.isEditing ? await loadExistingPhotoUrls(input.client, input.serviceId) : undefined;
  const uploader = createSupabaseJobPhotoUploader(input.client);
  const readBytes = input.readBytes ?? readPhotoBytes;
  const createUniqueId = input.createUniqueId ?? ((index: number) => `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`);
  const uploaded: string[] = [];

  for (let index = 0; index < localAssets.length; index += 1) {
    const asset = localAssets[index];
    let bytes: Uint8Array;
    try {
      bytes = await readBytes(asset.uri);
    } catch (error) {
      console.error('Failed to read job photo:', error);
      throw error instanceof JobPhotoUploadError ? error : new JobPhotoUploadError();
    }
    if (bytes.byteLength === 0) {
      throw new JobPhotoUploadError();
    }

    const objectPath = buildJobPhotoObjectPath(
      input.userId,
      input.serviceId,
      asset.name ?? asset.uri,
      index,
      createUniqueId(index),
    );

    let uploadError: { message?: string } | null;
    try {
      const result = await uploader.upload(JOB_PHOTOS_BUCKET, objectPath, bytes, {
        contentType: contentTypeForAsset(asset),
        upsert: false,
      });
      uploadError = result.error;
    } catch (error) {
      console.error('Job photo storage upload failed:', error);
      throw new JobPhotoUploadError();
    }
    if (uploadError) {
      console.error('Job photo storage upload failed:', uploadError.message);
      throw new JobPhotoUploadError();
    }

    const publicUrl = uploader.getPublicUrl(JOB_PHOTOS_BUCKET, objectPath);
    if (!isRemotePhotoUri(publicUrl)) {
      throw new JobPhotoUploadError();
    }
    uploaded.push(publicUrl);
  }

  const remoteAlreadySelected = assets.filter(asset => isRemotePhotoUri(asset.uri)).map(asset => asset.uri);
  return mergePhotoUrls(existing, [...remoteAlreadySelected, ...uploaded]);
}
