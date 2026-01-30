import { Injectable } from '@nestjs/common';
import geoip from 'geoip-lite';

export type Currency = 'THB' | 'USD';

export interface LocationInfo {
  country: string;
  currency: Currency;
  region?: string;
  city?: string;
  timezone?: string;
}

@Injectable()
export class LocationService {
  private readonly THAILAND_COUNTRY_CODE = 'TH';

  detectLocation(ipAddress: string): LocationInfo {
    const geo = geoip.lookup(ipAddress);

    if (!geo) {
      return {
        country: 'unknown',
        currency: 'USD',
      };
    }

    const currency: Currency =
      geo.country === this.THAILAND_COUNTRY_CODE ? 'THB' : 'USD';

    return {
      country: geo.country,
      currency,
      region: geo.region,
      city: geo.city,
      timezone: geo.timezone,
    };
  }

  getCurrency(ipAddress: string): Currency {
    const location = this.detectLocation(ipAddress);
    return location.currency;
  }
}
