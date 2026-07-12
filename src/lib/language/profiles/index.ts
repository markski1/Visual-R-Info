/** Perfil estable del lenguaje R-Info. */
export const RINFO_CORE_PROFILE = 'rinfo-core-v1' as const;

/** CMRE: Concurrent Multi Robot Environment, con scheduler determinista en el runtime. */
export const CMRE_PROFILE = 'cmre-v1' as const;

export type LanguageProfile = typeof RINFO_CORE_PROFILE | typeof CMRE_PROFILE;
