import { apiKeyMayAccess } from './roles.guard';

describe('apiKeyMayAccess', () => {
  it('never lets a key write, whatever its scopes', () => {
    expect(apiKeyMayAccess([], 'POST', '/api/activities')).toBe(false);
    expect(apiKeyMayAccess(['*'], 'DELETE', '/api/projects/1')).toBe(false);
    expect(apiKeyMayAccess(['activities:read'], 'PATCH', '/api/activities/1')).toBe(false);
  });

  it('keeps full read access for a key issued without scopes', () => {
    expect(apiKeyMayAccess([], 'GET', '/api/projects')).toBe(true);
    expect(apiKeyMayAccess([], 'GET', '/api/indicators/abc/performance')).toBe(true);
  });

  it('limits a scoped key to the resources its scopes name', () => {
    const scopes = ['indicators:read', 'activities:read'];
    expect(apiKeyMayAccess(scopes, 'GET', '/api/indicators?projectId=1')).toBe(true);
    expect(apiKeyMayAccess(scopes, 'GET', '/api/activities/statistics')).toBe(true);
    expect(apiKeyMayAccess(scopes, 'GET', '/api/projects')).toBe(false);
    expect(apiKeyMayAccess(scopes, 'GET', '/api/reporting/periods')).toBe(false);
  });

  it('treats * as every resource', () => {
    expect(apiKeyMayAccess(['*'], 'GET', '/api/reporting/periods')).toBe(true);
  });
});
