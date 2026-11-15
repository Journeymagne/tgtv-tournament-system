export const appBase = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
export const appPath = (pathname: string) => appBase + pathname;
