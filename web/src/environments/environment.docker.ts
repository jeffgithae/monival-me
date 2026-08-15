// Build used by web/Dockerfile for the containerised stack.
//
// The API is addressed by a RELATIVE url: nginx in the same container proxies
// /api to the api service (see web/nginx.conf), so the browser only ever talks
// to its own origin and CORS never enters the picture.
//
// This exists separately from environment.prod.ts because that file hard-codes
// the hosted Railway API — correct for that deployment, wrong for a local or
// self-hosted stack, where baking in an absolute production URL means a local
// container silently calls production.
export const environment = {
  production: true,
  apiUrl: '/api',
  googleClientId: '452423128809-8h0ferbrc6809hnkjpu1t1gpsupjc19j.apps.googleusercontent.com',
};
