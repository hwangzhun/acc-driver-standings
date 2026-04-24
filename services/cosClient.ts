import COS from 'cos-js-sdk-v5';

export interface CosRaceObjectItem {
  key: string;
  size: number;
  lastModified: string;
}

type StsCredentials = {
  tmpSecretId: string;
  tmpSecretKey: string;
  sessionToken: string;
  startTime?: number;
  expiredTime: number;
};

let cachedSts: StsCredentials | null = null;
let inflightSts: Promise<StsCredentials> | null = null;

function requireEnv(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  if (!value || typeof value !== 'string') {
    throw new Error(`MISSING_ENV:${name}`);
  }
  return value;
}

async function fetchStsFromEndpoint(): Promise<StsCredentials> {
  const endpoint = requireEnv('VITE_STS_ENDPOINT');
  const resp = await fetch(endpoint, { method: 'GET', cache: 'no-store' });
  if (!resp.ok) {
    throw new Error(`STS_FETCH_FAILED:${resp.status}`);
  }

  const raw = (await resp.json()) as Record<string, unknown>;
  const credentials = (raw.credentials ?? raw.credential ?? raw.Credentials) as
    | Record<string, unknown>
    | undefined;

  const tmpSecretId = String(
    credentials?.tmpSecretId ?? credentials?.TmpSecretId ?? raw.tmpSecretId ?? ''
  ).trim();
  const tmpSecretKey = String(
    credentials?.tmpSecretKey ?? credentials?.TmpSecretKey ?? raw.tmpSecretKey ?? ''
  ).trim();
  const sessionToken = String(
    credentials?.sessionToken ??
      credentials?.Token ??
      credentials?.token ??
      raw.sessionToken ??
      raw.token ??
      ''
  ).trim();

  const nowSec = Math.floor(Date.now() / 1000);
  const expiredTimeRaw =
    credentials?.expiredTime ??
    credentials?.ExpiredTime ??
    raw.expiredTime ??
    raw.ExpiredTime ??
    0;
  const startTimeRaw =
    credentials?.startTime ?? credentials?.StartTime ?? raw.startTime ?? raw.StartTime ?? nowSec;
  const expiredTime = Number(expiredTimeRaw) || nowSec + 300;
  const startTime = Number(startTimeRaw) || nowSec;

  if (!tmpSecretId || !tmpSecretKey || !sessionToken) {
    throw new Error('STS_INVALID_PAYLOAD');
  }

  return { tmpSecretId, tmpSecretKey, sessionToken, startTime, expiredTime };
}

async function getStsCredentials(): Promise<StsCredentials> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedSts && cachedSts.expiredTime - now > 30) {
    return cachedSts;
  }
  if (!inflightSts) {
    inflightSts = fetchStsFromEndpoint()
      .then((c) => {
        cachedSts = c;
        return c;
      })
      .finally(() => {
        inflightSts = null;
      });
  }
  return inflightSts;
}

function createCosClient(): COS {
  return new COS({
    getAuthorization: async (_options, callback) => {
      try {
        const sts = await getStsCredentials();
        callback({
          TmpSecretId: sts.tmpSecretId,
          TmpSecretKey: sts.tmpSecretKey,
          SecurityToken: sts.sessionToken,
          StartTime: sts.startTime,
          ExpiredTime: sts.expiredTime,
        });
      } catch (err) {
        console.error('STS authorization failed', err);
        callback({
          TmpSecretId: '',
          TmpSecretKey: '',
          SecurityToken: '',
          ExpiredTime: 0,
        });
      }
    },
  });
}

const cosClient = createCosClient();

function normalizePrefix(prefix: string): string {
  if (!prefix) return '';
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

export async function listRaceJsonObjects(prefix: string): Promise<CosRaceObjectItem[]> {
  const bucket = requireEnv('VITE_COS_BUCKET');
  const region = requireEnv('VITE_COS_REGION');
  const normalizedPrefix = normalizePrefix(prefix);

  const all: CosRaceObjectItem[] = [];
  let marker = '';
  let isTruncated = 'true';

  while (isTruncated === 'true') {
    const data = await cosClient.getBucket({
      Bucket: bucket,
      Region: region,
      Prefix: normalizedPrefix,
      Marker: marker,
      MaxKeys: 1000,
    });

    const contents = (data.Contents ?? []) as Array<{
      Key?: string;
      Size?: string | number;
      LastModified?: string;
    }>;

    for (const item of contents) {
      const key = String(item.Key ?? '').trim();
      if (!key || !/\.json$/i.test(key)) continue;
      all.push({
        key,
        size: Number(item.Size ?? 0) || 0,
        lastModified: String(item.LastModified ?? ''),
      });
    }

    marker = String(data.NextMarker ?? '');
    isTruncated = String(data.IsTruncated ?? 'false');
    if (!marker && isTruncated === 'true') break;
  }

  return all;
}

export async function getRaceJsonUrl(key: string): Promise<string> {
  const bucket = requireEnv('VITE_COS_BUCKET');
  const region = requireEnv('VITE_COS_REGION');
  const useSignedUrl = (import.meta.env.VITE_COS_USE_SIGNED_URL ?? 'true').toLowerCase() !== 'false';
  if (!useSignedUrl) {
    return `https://${bucket}.cos.${region}.myqcloud.com/${encodeURI(key)}`;
  }
  const signed = await cosClient.getObjectUrl({
    Bucket: bucket,
    Region: region,
    Key: key,
    Sign: true,
    Expires: 600,
  });
  return signed.Url;
}
