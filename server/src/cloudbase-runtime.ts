import cloudbaseNode from '@cloudbase/node-sdk';
import cloudbase from '@cloudbase/js-sdk';
import { generatePGClient } from '@cloudbase/wx-cloud-client-sdk';
import { createHash } from 'node:crypto';
import type { CoverStorage, RecipeApiDependencies, RpcExecutor, VerifiedIdentity } from './recipe-api';

type PostgrestResult<T> = { data: T | null; error: { message?: string; code?: string } | null };
type PostgrestClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<PostgrestResult<unknown>>;
};

const cloudbaseEnvId = process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || process.env.SCF_NAMESPACE;
const cloudbaseApiKey = String(process.env.CLOUDBASE_API_KEY || '').trim();
const nodeApp = cloudbaseNode.init(cloudbaseEnvId ? { env: cloudbaseEnvId } : {});
const platformApp = cloudbase.init({
  ...(cloudbaseEnvId ? { env: cloudbaseEnvId } : {}),
  ...(cloudbaseApiKey ? { accessKey: cloudbaseApiKey } : {})
});
const createServerPgClient = generatePGClient(nodeApp as never, {
  pgBaseUrl: `https://${cloudbaseEnvId}.api.tcloudbasegateway.com/v1/rdb/rest`,
  fetch: async (input, init) => {
    const apiKey = String(process.env.CLOUDBASE_API_KEY || '').trim();
    if (!apiKey) throw new Error('CLOUDBASE_API_KEY is not configured');
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${apiKey}`);
    headers.set('X-Db-Instance', 'default');
    headers.set('Accept-Profile', 'public');
    headers.set('Content-Profile', 'public');
    return fetch(input, { ...init, headers });
  }
});

const getIdentity = async (): Promise<VerifiedIdentity> => {
  const identity = nodeApp.auth().getUserInfo();
  const appId = String(identity.appId || '').trim();
  const openId = String(identity.openId || '').trim();
  const context = cloudbaseNode.getCloudbaseContext() as unknown as Record<string, unknown>;
  const userId = String(identity.uid || '').trim() || (
    appId && openId
      ? `wx_${createHash('sha256').update(`${appId}:${openId}`).digest('hex').slice(0, 40)}`
      : ''
  );
  return {
    userId,
    appId,
    openId,
    unionId: String(context.WX_UNIONID || '').trim() || undefined
  };
};

const rpc: RpcExecutor = {
  async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const client = createServerPgClient({ instance: 'default', database: 'public' });
    const result = await client.rpc(name, args);
    if (result.error) {
      const error = new Error(result.error.message || 'CloudBase PG RPC failed') as Error & { code?: string };
      error.code = result.error.code;
      throw error;
    }
    return result.data as T;
  }
};

const covers: CoverStorage = {
  async upload(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const result = await platformApp.storage.from('recipe-covers').upload(path, bytes, {
      contentType,
      upsert: false,
      metadata: { usage: 'recipe-cover' }
    });
    if (result.error) throw result.error;
  },
  async signedUrls(paths: string[]): Promise<Record<string, string>> {
    if (!paths.length) return {};
    const result = await platformApp.storage.from('recipe-covers').createSignedUrls(paths, 3600);
    if (result.error) throw result.error;
    const urls: Record<string, string> = {};
    for (const item of result.data) {
      if (item.fullSignedURL) urls[item.path] = item.fullSignedURL;
    }
    return urls;
  }
};

export const cloudbaseRecipeDependencies: RecipeApiDependencies = { getIdentity, rpc, covers };
