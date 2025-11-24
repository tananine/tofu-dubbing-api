const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const API_URL = process.env.API_URL || 'http://localhost:3000';

class AdminClient {
  constructor(apiKey, baseUrl = API_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async request(method, path, body = null) {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, options);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`${response.status}: ${error.message}`);
    }

    return response.json();
  }

  async getStats() {
    return this.request('GET', '/admin/stats');
  }

  async getLicenses(page = 1, limit = 50, status = null) {
    const params = new URLSearchParams({ page, limit });
    if (status) params.append('status', status);
    return this.request('GET', `/admin/licenses?${params}`);
  }

  async searchLicenses(query) {
    return this.request('GET', `/admin/licenses/search?q=${encodeURIComponent(query)}`);
  }

  async getLicense(id) {
    return this.request('GET', `/admin/licenses/${id}`);
  }

  async updateLicenseStatus(id, status, reason = null) {
    return this.request('PATCH', `/admin/licenses/${id}/status`, {
      status,
      reason,
    });
  }

  async updateLicenseExpiry(id, expiresAt) {
    return this.request('PATCH', `/admin/licenses/${id}/expiry`, {
      expiresAt,
    });
  }

  async updateMaxDevices(id, maxDevices) {
    return this.request('PATCH', `/admin/licenses/${id}/max-devices`, {
      maxDevices,
    });
  }

  async deleteLicense(id) {
    return this.request('DELETE', `/admin/licenses/${id}`);
  }

  async getDevices(page = 1, limit = 50) {
    return this.request('GET', `/admin/devices?page=${page}&limit=${limit}`);
  }

  async removeDevice(id) {
    return this.request('DELETE', `/admin/devices/${id}`);
  }

  async getLogs(page = 1, limit = 100, action = null) {
    const params = new URLSearchParams({ page, limit });
    if (action) params.append('action', action);
    return this.request('GET', `/admin/logs?${params}`);
  }
}

async function main() {
  if (!ADMIN_API_KEY) {
    console.error('Error: ต้องตั้งค่า ADMIN_API_KEY environment variable');
    process.exit(1);
  }

  const admin = new AdminClient(ADMIN_API_KEY);

  try {
    console.log('📊 Dashboard Stats:');
    const stats = await admin.getStats();
    console.log(JSON.stringify(stats, null, 2));
    console.log('\n');

    console.log('🎫 Recent Licenses:');
    const licenses = await admin.getLicenses(1, 5);
    console.log(JSON.stringify(licenses, null, 2));
    console.log('\n');

    console.log('✅ Admin API working!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default AdminClient;

