import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Ip,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LicenseService } from './license.service.js';
import {
  ActivateLicenseDto,
  VerifyLicenseDto,
  DeactivateLicenseDto,
} from './dto/index.js';
import { THROTTLE_LIMITS } from '../common/constants.js';

@Controller('license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  @Post('activate')
  @Throttle({ default: THROTTLE_LIMITS.ACTIVATE })
  @HttpCode(HttpStatus.OK)
  activate(@Body() dto: ActivateLicenseDto, @Ip() ip: string) {
    return this.licenseService.activateLicense(dto, ip);
  }

  @Post('verify')
  @Throttle({ default: THROTTLE_LIMITS.VERIFY })
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyLicenseDto, @Ip() ip: string) {
    return this.licenseService.verifyLicense(dto, ip);
  }

  @Post('deactivate')
  @Throttle({ default: THROTTLE_LIMITS.DEACTIVATE })
  @HttpCode(HttpStatus.OK)
  deactivate(@Body() dto: DeactivateLicenseDto, @Ip() ip: string) {
    return this.licenseService.deactivateLicense(dto, ip);
  }

  @Get('info/:licenseKey')
  @Throttle({ default: THROTTLE_LIMITS.INFO })
  getInfo(@Param('licenseKey') licenseKey: string) {
    return this.licenseService.getLicenseInfo(licenseKey);
  }
}
