import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CheckResultDto,
  DashboardSummaryDto,
  ImmediateCheckResponse,
  IncidentDto,
  MonitorDto,
  MonitorStatsDto,
} from '@devpulse/shared';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { MonitorsService } from './monitors.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { IncidentsService } from '../incidents/incidents.service';
import { MetricsService } from '../metrics/metrics.service';
import { CreateMonitorDto } from './dto/create-monitor.dto';
import { UpdateMonitorDto } from './dto/update-monitor.dto';
import { GetMonitorStatsDto } from '../metrics/dto/get-monitor-stats.dto';

@Controller('monitors')
@UseGuards(CsrfGuard)
export class MonitorsController {
  constructor(
    private readonly monitorsService: MonitorsService,
    private readonly monitoringService: MonitoringService,
    private readonly incidentsService: IncidentsService,
    private readonly metricsService: MetricsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMonitorDto,
  ): Promise<MonitorDto> {
    return this.monitorsService.create(user.id, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<MonitorDto[]> {
    return this.monitorsService.findAll(user.id);
  }

  @Get('dashboard/summary')
  @HttpCode(HttpStatus.OK)
  async getDashboardSummary(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DashboardSummaryDto> {
    return this.metricsService.getDashboardSummary(user.id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MonitorDto> {
    return this.monitorsService.findOne(id, user.id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMonitorDto,
  ): Promise<MonitorDto> {
    return this.monitorsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    return this.monitorsService.remove(id, user.id);
  }

  @Post(':id/check')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerManualCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ImmediateCheckResponse> {
    return this.monitoringService.enqueueManualCheck(id, user.id);
  }

  @Get(':id/checks')
  @HttpCode(HttpStatus.OK)
  async getRecentChecks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ): Promise<CheckResultDto[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.monitoringService.getRecentChecks(id, user.id, parsedLimit);
  }

  @Get(':id/checks/latest')
  @HttpCode(HttpStatus.OK)
  async getLatestCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CheckResultDto | null> {
    return this.monitoringService.getLatestCheck(id, user.id);
  }

  @Get(':id/stats')
  @HttpCode(HttpStatus.OK)
  async getStats(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: GetMonitorStatsDto,
  ): Promise<MonitorStatsDto> {
    return this.metricsService.getMonitorStats(id, user.id, query.window);
  }

  @Get(':id/incidents')
  @HttpCode(HttpStatus.OK)
  async getMonitorIncidents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('status') status?: 'active' | 'resolved' | 'all',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<IncidentDto[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.incidentsService.findAllForMonitor(id, user.id, {
      status,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }
}
