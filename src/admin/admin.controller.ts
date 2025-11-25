import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AdminAuthGuard } from './guards/admin-auth.guard.js';
import {
  UpdateLicenseStatusDto,
  UpdateLicenseExpiryDto,
  UpdateMaxDevicesDto,
  CreateLicenseDto,
  LicenseStatus,
} from './dto/update-license.dto.js';
import { PAGINATION_DEFAULTS } from '../common/constants.js';

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('licenses')
  async getAllLicenses(
    @Query('page', new DefaultValuePipe(PAGINATION_DEFAULTS.PAGE), ParseIntPipe)
    page: number,
    @Query('limit', new DefaultValuePipe(PAGINATION_DEFAULTS.LICENSE_LIMIT), ParseIntPipe)
    limit: number,
    @Query('status') status?: LicenseStatus,
  ) {
    return this.adminService.getAllLicenses(page, limit, status);
  }

  @Post('licenses')
  async createLicense(@Body() dto: CreateLicenseDto) {
    const license = await this.adminService.createLicense({
      email: dto.email,
      stripePaymentId: dto.stripePaymentId,
      maxDevices: dto.maxDevices,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
    return { success: true, license };
  }

  @Get('licenses/search')
  async searchLicenses(@Query('q') query: string) {
    return this.adminService.searchLicenses(query);
  }

  @Get('licenses/:id')
  async getLicenseById(@Param('id') id: string) {
    return this.adminService.getLicenseById(id);
  }

  @Patch('licenses/:id/status')
  async updateLicenseStatus(
    @Param('id') id: string,
    @Body() dto: UpdateLicenseStatusDto,
  ) {
    const [license] = await this.adminService.updateLicenseStatus(
      id,
      dto.status,
      dto.reason,
    );
    return { success: true, license };
  }

  @Patch('licenses/:id/expiry')
  async updateLicenseExpiry(
    @Param('id') id: string,
    @Body() dto: UpdateLicenseExpiryDto,
  ) {
    const license = await this.adminService.updateLicenseExpiry(
      id,
      dto.expiresAt ? new Date(dto.expiresAt) : null,
    );
    return { success: true, license };
  }

  @Patch('licenses/:id/max-devices')
  async updateMaxDevices(
    @Param('id') id: string,
    @Body() dto: UpdateMaxDevicesDto,
  ) {
    const license = await this.adminService.updateMaxDevices(
      id,
      dto.maxDevices,
    );
    return { success: true, license };
  }

  @Delete('licenses/:id')
  async deleteLicense(@Param('id') id: string) {
    return this.adminService.deleteLicense(id);
  }

  @Get('devices')
  async getAllDevices(
    @Query('page', new DefaultValuePipe(PAGINATION_DEFAULTS.PAGE), ParseIntPipe)
    page: number,
    @Query('limit', new DefaultValuePipe(PAGINATION_DEFAULTS.DEVICE_LIMIT), ParseIntPipe)
    limit: number,
  ) {
    return this.adminService.getAllDevices(page, limit);
  }

  @Delete('devices/:id')
  async removeDevice(@Param('id') id: string) {
    return this.adminService.removeDevice(id);
  }

  @Get('logs')
  async getLogs(
    @Query('page', new DefaultValuePipe(PAGINATION_DEFAULTS.PAGE), ParseIntPipe)
    page: number,
    @Query('limit', new DefaultValuePipe(PAGINATION_DEFAULTS.LOG_LIMIT), ParseIntPipe)
    limit: number,
    @Query('action') action?: string,
  ) {
    return this.adminService.getLogs(page, limit, action);
  }
}
