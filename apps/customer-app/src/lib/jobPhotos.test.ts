import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePhotoUrls as parseProviderPhotoUrls } from '../../../serviceprovider-app/src/lib/jobPhotoUrls.ts';
import {
  JOB_PHOTOS_BUCKET,
  JobPhotoUploadError,
  buildJobPhotoObjectPath,
  contentTypeForAsset,
  mergePhotoUrls,
  parsePhotoUrls,
  resolveJobPhotoUrls,
  sanitizePhotoFileName,
} from './jobPhotos.ts';

const ownerId = 'user-123';
const serviceId = 'service-456';

function fakeClient(options?: {
  uploadErrorAt?: number;
  publicUrl?: string | null;
  existing?: unknown;
  throwOnUpload?: boolean;
}) {
  const uploads: Array<{ bucket: string; path: string; contentType: string; upsert: boolean; bytes: number }> = [];
  let uploadCount = 0;
  let loadedExisting = false;
  const client = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Uint8Array, uploadOptions: { contentType?: string; upsert?: boolean }) => {
          uploadCount += 1;
          uploads.push({
            bucket,
            path,
            contentType: uploadOptions.contentType ?? '',
            upsert: Boolean(uploadOptions.upsert),
            bytes: body.byteLength,
          });
          if (options?.throwOnUpload) {
            throw new Error('network down');
          }
          if (options?.uploadErrorAt === uploadCount) {
            return { error: { message: 'bucket missing' } };
          }
          return { error: null };
        },
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl:
              options && 'publicUrl' in options
                ? options.publicUrl ?? ''
                : `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
      }),
    },
    from: (_table: string) => ({
      select: (_columns: string) => ({
        eq: (_column: string, _value: string) => ({
          maybeSingle: async () => {
            loadedExisting = true;
            return { data: { photo_urls: options?.existing ?? [] }, error: null };
          },
        }),
      }),
    }),
  };

  return { client, uploads, wasExistingLoaded: () => loadedExisting };
}

const readBytes = async () => new Uint8Array([1, 2, 3, 4]);

test('object paths stay inside the owner and service folders', () => {
  const path = buildJobPhotoObjectPath(ownerId, serviceId, '../../etc/passwd.jpg', 0, 'id 1');
  assert.equal(path, `${ownerId}/${serviceId}/id1-passwd.jpg`);
  assert.equal(sanitizePhotoFileName('..', 2), 'photo-3.jpg');
  assert.throws(() => buildJobPhotoObjectPath('///', serviceId, 'a.jpg', 0, 'id'), JobPhotoUploadError);
});

test('content types follow the file extension and video flag', () => {
  assert.equal(contentTypeForAsset({ uri: 'file://a.png', name: 'a.png' }), 'image/png');
  assert.equal(contentTypeForAsset({ uri: 'file://clip.mov', name: 'clip.mov', type: 'video' }), 'video/quicktime');
  assert.equal(contentTypeForAsset({ uri: 'file://clip', type: 'video' }), 'video/mp4');
  assert.equal(contentTypeForAsset({ uri: 'file://a', contentType: 'image/webp' }), 'image/webp');
  assert.equal(contentTypeForAsset({ uri: 'file://a' }), 'image/jpeg');
});

test('photo url parsing drops device URIs and accepts json arrays', () => {
  const fixtures = [
    ['https://cdn.example/a.jpg', 'file:///tmp/a.jpg', 'http://cdn.example/b.jpg'],
    '["https://cdn.example/a.jpg","file:///tmp/a.jpg"]',
    'file:///tmp/a.jpg',
    null,
    { url: 'https://cdn.example/a.jpg' },
  ];
  for (const fixture of fixtures) {
    assert.deepEqual(parsePhotoUrls(fixture), parseProviderPhotoUrls(fixture));
  }
  assert.deepEqual(parsePhotoUrls(fixtures[0]), ['https://cdn.example/a.jpg', 'http://cdn.example/b.jpg']);
  assert.deepEqual(mergePhotoUrls(['https://cdn.example/a.jpg', 'file:///tmp/a.jpg'], ['https://cdn.example/b.jpg', 'https://cdn.example/a.jpg']), [
    'https://cdn.example/a.jpg',
    'https://cdn.example/b.jpg',
  ]);
});

test('no local photos skips storage and leaves the column untouched', async () => {
  const fake = fakeClient();
  const urls = await resolveJobPhotoUrls({
    client: fake.client,
    userId: ownerId,
    serviceId,
    assets: [{ uri: 'https://cdn.example/already.jpg', name: 'already.jpg' }],
    isEditing: false,
    readBytes,
    createUniqueId: index => `id-${index}`,
  });
  assert.equal(urls, undefined);
  assert.equal(fake.uploads.length, 0);
  assert.equal(fake.wasExistingLoaded(), false);
});

test('uploads local photos to job-photos and returns only public urls', async () => {
  const fake = fakeClient({ existing: ['https://cdn.example/old.jpg', 'file:///tmp/old.jpg'] });
  const urls = await resolveJobPhotoUrls({
    client: fake.client,
    userId: ownerId,
    serviceId,
    assets: [
      { uri: 'file:///tmp/new.jpg', name: 'kitchen.jpg', type: 'photo' },
      { uri: 'https://cdn.example/kept.jpg', name: 'kept.jpg' },
    ],
    isEditing: true,
    readBytes,
    createUniqueId: index => `id-${index}`,
  });
  assert.equal(fake.uploads.length, 1);
  assert.equal(fake.uploads[0].bucket, JOB_PHOTOS_BUCKET);
  assert.equal(fake.uploads[0].upsert, false);
  assert.equal(fake.uploads[0].contentType, 'image/jpeg');
  assert.equal(fake.wasExistingLoaded(), true);
  assert.deepEqual(urls, [
    'https://cdn.example/old.jpg',
    'https://cdn.example/kept.jpg',
    `https://example.supabase.co/storage/v1/object/public/${JOB_PHOTOS_BUCKET}/${ownerId}/${serviceId}/id-0-kitchen.jpg`,
  ]);
  assert.ok(urls?.every(url => url.startsWith('https://')));
});

test('upload failure throws before a successful photo list is returned', async () => {
  const fake = fakeClient({ uploadErrorAt: 2 });
  await assert.rejects(
    () =>
      resolveJobPhotoUrls({
        client: fake.client,
        userId: ownerId,
        serviceId,
        assets: [
          { uri: 'file:///tmp/one.jpg', name: 'one.jpg' },
          { uri: 'file:///tmp/two.jpg', name: 'two.jpg' },
        ],
        isEditing: false,
        readBytes,
        createUniqueId: index => `id-${index}`,
      }),
    JobPhotoUploadError,
  );
  assert.equal(fake.uploads.length, 2);
  assert.equal(fake.wasExistingLoaded(), false);
});

test('storage exceptions and empty reads are visible failures', async () => {
  const throwing = fakeClient({ throwOnUpload: true });
  await assert.rejects(
    () =>
      resolveJobPhotoUrls({
        client: throwing.client,
        userId: ownerId,
        serviceId,
        assets: [{ uri: 'file:///tmp/one.jpg', name: 'one.jpg' }],
        isEditing: false,
        readBytes,
        createUniqueId: index => `id-${index}`,
      }),
    JobPhotoUploadError,
  );

  const empty = fakeClient();
  await assert.rejects(
    () =>
      resolveJobPhotoUrls({
        client: empty.client,
        userId: null,
        serviceId,
        assets: [{ uri: 'file:///tmp/one.jpg', name: 'one.jpg' }],
        isEditing: false,
        readBytes,
      }),
    JobPhotoUploadError,
  );
  assert.equal(empty.uploads.length, 0);

  await assert.rejects(
    () =>
      resolveJobPhotoUrls({
        client: empty.client,
        userId: ownerId,
        serviceId,
        assets: [{ uri: 'file:///tmp/one.jpg', name: 'one.jpg' }],
        isEditing: false,
        readBytes: async () => new Uint8Array(),
        createUniqueId: index => `id-${index}`,
      }),
    JobPhotoUploadError,
  );
});
