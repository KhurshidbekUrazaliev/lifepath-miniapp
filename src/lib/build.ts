// Which build of the app this is. vite.config.ts writes it in when the app is built: the date and
// time (UTC) and the commit, like "261117.0423-edab962". About shows it, and an error report carries
// it, so that an error can be traced to the release it came from.
declare const __LP_BUILD__: string | undefined;

export const BUILD: string = typeof __LP_BUILD__ === 'string' && __LP_BUILD__ ? __LP_BUILD__ : 'dev';
