import {
  Body, Controller, Delete, Get, Param, Patch, Post,
  Query, UseGuards, UploadedFile, UseInterceptors, Headers,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERMISSIONS } from '../common/constants/roles';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload';
import { IntegrationsService } from './integrations.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';

/** Minimal type covering what we need from multer's File object */
interface UploadedMulterFile {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype: string;
}

@Controller('forms/integrations')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get('stats')
  @Roles(...PERMISSIONS.VIEW_DATA_COLLECTION)
  getStats(@CurrentUser() user: JwtPayload) {
    return this.service.getStats(user.organizationId);
  }

  @Get()
  @Roles(...PERMISSIONS.VIEW_DATA_COLLECTION)
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
  ) {
    const integrations = await this.service.findAll(user.organizationId, projectId);
    return this.mayManage(user) ? integrations : integrations.map((i) => IntegrationsService.withoutSecrets(i));
  }

  /** Only those who configure integrations see the credentials inside them. */
  private mayManage(user: JwtPayload): boolean {
    return (PERMISSIONS.MANAGE_DATA_COLLECTION as readonly string[]).includes(user.role);
  }

  @Get(':id')
  @Roles(...PERMISSIONS.VIEW_DATA_COLLECTION)
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const integration = await this.service.findOne(user.organizationId, id);
    return this.mayManage(user) ? integration : IntegrationsService.withoutSecrets(integration);
  }

  @Post()
  @Roles(...PERMISSIONS.MANAGE_DATA_COLLECTION)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateIntegrationDto,
  ) {
    return this.service.create(user.organizationId, dto, user.sub);
  }

  @Patch(':id')
  @Roles(...PERMISSIONS.MANAGE_DATA_COLLECTION)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationDto,
  ) {
    return this.service.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Roles(...PERMISSIONS.MANAGE_DATA_COLLECTION)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id);
  }

  /** Manually trigger a pull-sync for KoboToolbox / ODK / Ona / CommCare */
  @Post(':id/sync')
  @Roles(...PERMISSIONS.MANAGE_DATA_COLLECTION)
  triggerSync(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.triggerSync(user.organizationId, id, user.sub);
  }

  /** Upload a CSV file and import rows as form responses */
  @Post(':id/upload')
  @Roles(...PERMISSIONS.MANAGE_DATA_COLLECTION)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @UploadedFile() file: UploadedMulterFile,
    @Body('delimiter') delimiter?: string,
  ) {
    const csv = file.buffer.toString('utf-8');
    const rows = parseCsv(csv, delimiter ?? ',');
    return this.service.importCsv(user.organizationId, id, rows, user.sub);
  }
}

/** Minimal CSV parser — good for flat tabular data */
function parseCsv(text: string, delimiter = ','): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitLine(lines[0], delimiter);
  return lines.slice(1).map((line, idx) => {
    const values = splitLine(line, delimiter);
    const row: Record<string, unknown> = { __csv_row_index: String(idx) };
    headers.forEach((h, i) => {
      row[h.trim()] = values[i]?.trim() ?? '';
    });
    return row;
  });
}

function splitLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === delimiter && !inQuotes) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

/**
 * Where external systems push data. There is no user session here: the caller
 * presents the integration's secret in `X-Webhook-Secret`. Kept in its own
 * controller so none of the session guards above apply to it.
 */
@Controller('forms/integrations')
export class IntegrationWebhookController {
  constructor(private readonly service: IntegrationsService) {}

  @Post(':id/webhook')
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  ingest(
    @Param('id') id: string,
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.service.ingestWebhookBySecret(id, secret, payload);
  }
}
