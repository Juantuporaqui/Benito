// Variables globales que comparten los módulos
export const appId  = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

export let userId   = null;
export function setUserId (id) { userId = id; }
