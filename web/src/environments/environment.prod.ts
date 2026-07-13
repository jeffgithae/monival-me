// Production build only (swapped in via angular.json fileReplacements).
// Local dev uses environment.ts / environment.development.ts, which point at
// http://localhost:3000/api — no need to edit this file for local testing.
export const environment = {
  production: true,
  apiUrl: 'https://monival-me-production.up.railway.app/api',
  googleClientId: '452423128809-8h0ferbrc6809hnkjpu1t1gpsupjc19j.apps.googleusercontent.com', // <-- Replace with your Google OAuth Client ID
};
