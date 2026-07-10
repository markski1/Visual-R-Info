/** Perfil estable que implementará el primer MVP. */
export const RINFO_CORE_PROFILE = 'rinfo-core-v1' as const;

export type LanguageProfile = typeof RINFO_CORE_PROFILE | 'rinfo-compat-legacy' | 'cmre-v1';
