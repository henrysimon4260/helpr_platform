export class MissingSupabaseEnvError extends Error {
  readonly missing: readonly string[]

  constructor(missing: readonly string[]) {
    super(`Missing required environment: ${missing.join(', ')}`)
    this.name = 'MissingSupabaseEnvError'
    this.missing = missing
  }
}

export type SupabaseClientConfig = {
  url: string
  serviceRoleKey: string
}

type EnvSource = {
  get(name: string): string | undefined
}

function requiredEnv(env: EnvSource, name: string, missing: string[]): string {
  const value = env.get(name)?.trim() ?? ''
  if (!value) {
    missing.push(name)
  }
  return value
}

/**
 * Read the Supabase URL and service-role key from the provided env.
 * Missing or blank values throw. There is no project URL default.
 */
export function readSupabaseClientConfig(env: EnvSource): SupabaseClientConfig {
  const missing: string[] = []
  const url = requiredEnv(env, 'SUPABASE_URL', missing)
  const serviceRoleKey = requiredEnv(env, 'SUPABASE_SERVICE_ROLE_KEY', missing)
  if (missing.length > 0) {
    throw new MissingSupabaseEnvError(missing)
  }
  return { url, serviceRoleKey }
}

/**
 * Build a Supabase client only after env is present.
 * The factory is not called when configuration is missing.
 */
export function createConfiguredSupabaseClient<T>(
  env: EnvSource,
  createClient: (url: string, serviceRoleKey: string) => T,
): T {
  const config = readSupabaseClientConfig(env)
  return createClient(config.url, config.serviceRoleKey)
}
